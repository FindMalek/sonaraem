import { db } from "@sonaraem/db";
import { pipelineRun } from "@sonaraem/db/schema/pipeline-run";
import { logger } from "@sonaraem/logger";
import { schedules } from "@trigger.dev/sdk";
import { and, eq } from "drizzle-orm";

import { updateRun } from "../../services/organize";
import { nextEligibleForCron } from "../../services/spotify-allowlist";
import { organizePipeline } from "./organize";

const RUNNING_CONSTRAINT_NAME = "pipeline_run_one_running_per_user";
const MAX_INSERT_ATTEMPTS = 3;
// Bounds the query — far more than the realistic weekly count under the allowlist pool (#290).
const CRON_BATCH_SIZE = 100;

function isAlreadyRunningConflict(err: unknown): boolean {
	if (typeof err !== "object" || err === null) return false;
	if (!("code" in err) || !("constraint" in err)) return false;
	return err.code === "23505" && err.constraint === RUNNING_CONSTRAINT_NAME;
}

async function findRunningRunId(userId: string): Promise<number | null> {
	const [existing] = await db
		.select({ id: pipelineRun.id })
		.from(pipelineRun)
		.where(
			and(eq(pipelineRun.userId, userId), eq(pipelineRun.status, "running")),
		);
	return existing?.id ?? null;
}

export type InsertRunResult =
	| { kind: "created"; runId: number }
	| { kind: "skipped"; runId: number };

// Retries the insert if the running-conflict clears between our attempt and the lookup (narrow race).
export async function insertRunOrSkip(
	userId: string,
	triggeredBy: "user" | "cron",
): Promise<InsertRunResult> {
	for (let attempt = 0; attempt < MAX_INSERT_ATTEMPTS; attempt++) {
		try {
			const [inserted] = await db
				.insert(pipelineRun)
				.values({
					userId,
					status: "running",
					triggeredBy,
					currentStage: "sync",
					startedAt: new Date(),
				})
				.returning({ id: pipelineRun.id });

			if (!inserted) throw new Error("Failed to create run record");
			return { kind: "created", runId: inserted.id };
		} catch (err) {
			if (!isAlreadyRunningConflict(err)) throw err;

			const existingRunId = await findRunningRunId(userId);
			if (existingRunId !== null) {
				return { kind: "skipped", runId: existingRunId };
			}
		}
	}
	throw new Error(
		`Failed to create pipeline run for user ${userId} after ${MAX_INSERT_ATTEMPTS} attempts (repeatedly raced with another run)`,
	);
}

export type OrganizeAllUsersResult = {
	userId: string;
	runId: number;
	status: "completed" | "failed" | "skipped";
	error?: string;
};

// triggeredBy: "cron" is what makes send-organize-complete.ts send the weekly digest email.
// Fairness vs. a concurrent manual request isn't handled here — tryAcquireSlot re-checks front-of-queue per poll.
export async function runOrganizeForAllUsers(): Promise<
	OrganizeAllUsersResult[]
> {
	const userIds = await nextEligibleForCron(CRON_BATCH_SIZE);
	const results: OrganizeAllUsersResult[] = [];

	for (const id of userIds) {
		try {
			const insertResult = await insertRunOrSkip(id, "cron");

			if (insertResult.kind === "skipped") {
				logger.info(
					{ userId: id, existingRunId: insertResult.runId },
					"organize run skipped for user — a run is already in progress",
				);
				results.push({
					userId: id,
					runId: insertResult.runId,
					status: "skipped",
					error: "A pipeline run is already in progress",
				});
				continue;
			}

			const runId = insertResult.runId;

			try {
				await organizePipeline.trigger({ userId: id, runId });
				results.push({ userId: id, runId, status: "completed" });
			} catch (triggerErr) {
				const error =
					triggerErr instanceof Error
						? triggerErr
						: new Error(String(triggerErr));
				await updateRun(runId, {
					status: "failed",
					error: error.message,
					completedAt: new Date(),
				});
				logger.error(
					{ userId: id, runId, error: error.message },
					"Failed to queue organize for user",
				);
				results.push({
					userId: id,
					runId,
					status: "failed",
					error: error.message,
				});
			}
		} catch (err) {
			const error = err instanceof Error ? err : new Error(String(err));
			logger.error(
				{ userId: id, error: error.message },
				"Failed to queue organize for user",
			);
			results.push({
				userId: id,
				runId: -1,
				status: "failed",
				error: error.message,
			});
		}
	}

	return results;
}

export const organizeWeeklyCronTask = schedules.task({
	id: "organize-weekly-cron",
	cron: "0 8 * * 1",
	run: async () => {
		const results = await runOrganizeForAllUsers();
		const summary = {
			total: results.length,
			completed: results.filter((r) => r.status === "completed").length,
			skipped: results.filter((r) => r.status === "skipped").length,
			failed: results.filter((r) => r.status === "failed").length,
		};
		logger.info(summary, "Completed weekly organize cron run");
		return summary;
	},
});
