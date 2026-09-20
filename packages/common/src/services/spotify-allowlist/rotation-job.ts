import { db } from "@sonaraem/db";
import { spotifyRotationJob } from "@sonaraem/db/schema/spotify-allowlist";
import { and, asc, desc, eq, inArray, lt, lte, sql } from "drizzle-orm";

export type RotationJobType = "snapshot_refresh" | "export";

const PRIORITY: Record<RotationJobType, number> = {
	// Someone is actively waiting on an export they just requested.
	export: 20,
	// Background refresh — nobody's watching, can wait behind export.
	snapshot_refresh: 10,
};

/**
 * Idempotent: does nothing if this user already has an unfinished job of the
 * same type queued. Never opens a second job for work that's already pending —
 * consolidation happens at dispatch time (see getNextConsolidatedBatch), not
 * by allowing duplicates here.
 */
async function hasUnfinishedJob(
	userId: string,
	jobType: RotationJobType,
): Promise<boolean> {
	const [row] = await db
		.select({ id: spotifyRotationJob.id })
		.from(spotifyRotationJob)
		.where(
			and(
				eq(spotifyRotationJob.userId, userId),
				eq(spotifyRotationJob.jobType, jobType),
				inArray(spotifyRotationJob.status, ["queued", "dispatched", "active"]),
			),
		)
		.limit(1);
	return !!row;
}

export async function enqueueSnapshotRefresh(
	userId: string,
	opts: { deadlineAt?: Date } = {},
): Promise<void> {
	if (await hasUnfinishedJob(userId, "snapshot_refresh")) return;
	await db.insert(spotifyRotationJob).values({
		userId,
		jobType: "snapshot_refresh",
		priority: PRIORITY.snapshot_refresh,
		deadlineAt: opts.deadlineAt ?? null,
	});
}

/**
 * A second export request while one is already queued merges its playlist
 * IDs into that job instead of being silently dropped — a job already
 * dispatched/active is in flight and can't be safely mutated, so that case
 * queues a follow-up job instead.
 */
export async function enqueueExport(
	userId: string,
	playlistIds: number[],
	opts: { deadlineAt?: Date } = {},
): Promise<void> {
	const [existing] = await db
		.select({
			id: spotifyRotationJob.id,
			status: spotifyRotationJob.status,
			playlistIds: spotifyRotationJob.playlistIds,
		})
		.from(spotifyRotationJob)
		.where(
			and(
				eq(spotifyRotationJob.userId, userId),
				eq(spotifyRotationJob.jobType, "export"),
				inArray(spotifyRotationJob.status, ["queued", "dispatched", "active"]),
			),
		)
		.limit(1);

	if (existing?.status === "queued") {
		const merged = Array.from(
			new Set([...(existing.playlistIds ?? []), ...playlistIds]),
		);
		await db
			.update(spotifyRotationJob)
			.set({ playlistIds: merged })
			.where(eq(spotifyRotationJob.id, existing.id));
		return;
	}

	await db.insert(spotifyRotationJob).values({
		userId,
		jobType: "export",
		priority: PRIORITY.export,
		playlistIds,
		deadlineAt: opts.deadlineAt ?? null,
	});
}

export type ConsolidatedBatch = {
	userId: string;
	jobs: Array<{
		id: number;
		jobType: RotationJobType;
		playlistIds: number[] | null;
	}>;
};

/**
 * Picks the single highest-priority eligible job, then pulls in *every other*
 * queued job for that same user so they're serviced in one add/remove cycle —
 * this is the consolidation rule from docs/decisions/0001: never touch a
 * user's allowlist membership twice for work that could have been done once.
 * Marks the whole batch 'dispatched' so a concurrent dispatcher run (there
 * shouldn't be one — the dispatcher task runs at concurrencyLimit: 1 — but
 * cheap insurance) won't double-pick it.
 */
// Reclaims jobs stuck "dispatched" if the dispatcher died before its try block ran — otherwise only "queued" jobs get picked and they'd sit ineligible forever.
const STALE_DISPATCH_MS = 30 * 60 * 1000;

export async function getNextConsolidatedBatch(): Promise<ConsolidatedBatch | null> {
	return db.transaction(async (tx) => {
		await tx
			.update(spotifyRotationJob)
			.set({ status: "queued" })
			.where(
				and(
					eq(spotifyRotationJob.status, "dispatched"),
					lt(
						spotifyRotationJob.lastAttemptAt,
						new Date(Date.now() - STALE_DISPATCH_MS),
					),
				),
			);

		const [head] = await tx
			.select({ userId: spotifyRotationJob.userId })
			.from(spotifyRotationJob)
			.where(
				and(
					eq(spotifyRotationJob.status, "queued"),
					lte(spotifyRotationJob.eligibleAt, new Date()),
				),
			)
			.orderBy(
				desc(spotifyRotationJob.priority),
				asc(spotifyRotationJob.createdAt),
			)
			.limit(1);

		if (!head) return null;

		const pending = await tx
			.select({
				id: spotifyRotationJob.id,
				jobType: spotifyRotationJob.jobType,
				playlistIds: spotifyRotationJob.playlistIds,
			})
			.from(spotifyRotationJob)
			.where(
				and(
					eq(spotifyRotationJob.userId, head.userId),
					eq(spotifyRotationJob.status, "queued"),
					lte(spotifyRotationJob.eligibleAt, new Date()),
				),
			);

		if (pending.length === 0) return null;

		await tx
			.update(spotifyRotationJob)
			.set({ status: "dispatched", lastAttemptAt: new Date() })
			.where(
				inArray(
					spotifyRotationJob.id,
					pending.map((j) => j.id),
				),
			);

		return { userId: head.userId, jobs: pending };
	});
}

export async function markJobsDone(jobIds: number[]): Promise<void> {
	if (jobIds.length === 0) return;
	await db
		.update(spotifyRotationJob)
		.set({ status: "done", completedAt: new Date() })
		.where(inArray(spotifyRotationJob.id, jobIds));
}

const MAX_JOB_RETRIES = 3;

/**
 * Requeues with incremented retryCount up to MAX_JOB_RETRIES, then gives up —
 * a permanently-failing job (e.g. a dead refresh token) must not sit
 * consuming dispatcher attention forever.
 */
export async function markJobsFailed(
	jobIds: number[],
	error: string,
): Promise<void> {
	if (jobIds.length === 0) return;
	await db
		.update(spotifyRotationJob)
		.set({
			status: sql`CASE WHEN ${spotifyRotationJob.retryCount} + 1 >= ${MAX_JOB_RETRIES} THEN 'failed' ELSE 'queued' END`,
			retryCount: sql`${spotifyRotationJob.retryCount} + 1`,
			lastError: error,
			// Backoff so a failing job doesn't get re-picked on the very next dispatch tick.
			eligibleAt: sql`now() + interval '30 minutes'`,
		})
		.where(inArray(spotifyRotationJob.id, jobIds));
}

/**
 * Budget exhaustion is an expected, routine wait, not a failure — requeue
 * without touching retryCount or lastError so it doesn't burn one of a
 * job's limited lifetime attempts just for showing up while the rolling
 * 24h ledger happened to be tapped out (#408).
 */
export async function requeueForBudget(jobIds: number[]): Promise<void> {
	if (jobIds.length === 0) return;
	await db
		.update(spotifyRotationJob)
		.set({ status: "queued", eligibleAt: sql`now() + interval '10 minutes'` })
		.where(inArray(spotifyRotationJob.id, jobIds));
}
