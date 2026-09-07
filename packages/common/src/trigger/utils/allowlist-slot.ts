import { db } from "@sonaraem/db";
import { user } from "@sonaraem/db/schema/auth";
import { pipelineRun } from "@sonaraem/db/schema/pipeline-run";
import { logger } from "@sonaraem/logger";
import { wait } from "@trigger.dev/sdk";
import { eq } from "drizzle-orm";

import { checkCancelled } from "../../services/organize";
import {
	enqueue,
	failActiveRequestForSlot,
	releaseSlot,
	settleWaitingRequest,
	tryAcquireSlot,
} from "../../services/spotify-allowlist";
import { manageAllowlistEntryTask } from "../tasks/spotify-allowlist/manage-allowlist-entry";

function errMessage(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

const POLL_INTERVAL_SECONDS = 10;
// Comfortably under queue.ts's 30-min DEFAULT_OCCUPIED_TIMEOUT_MS so a waiting stage never races timeoutReclaim.
const MAX_WAIT_SECONDS = 20 * 60;

export class AllowlistSlotTimeoutError extends Error {
	constructor() {
		super("Timed out waiting for a free Spotify allowlist slot");
		this.name = "AllowlistSlotTimeoutError";
	}
}

async function priorityForRun(runId: number): Promise<"manual" | "cron"> {
	const [run] = await db
		.select({ triggeredBy: pipelineRun.triggeredBy })
		.from(pipelineRun)
		.where(eq(pipelineRun.id, runId));
	return run?.triggeredBy === "cron" ? "cron" : "manual";
}

async function getUserEmail(userId: string): Promise<string> {
	const [row] = await db
		.select({ email: user.email })
		.from(user)
		.where(eq(user.id, userId));
	if (!row) {
		throw new Error(
			`User ${userId} not found while acquiring an allowlist slot`,
		);
	}
	return row.email;
}

// Holds a Spotify allowlist slot for `work` — a busy pool is a wait state, not a failure, so this durably polls until one frees up.
export async function withAllowlistSlot<T>(
	userId: string,
	runId: number,
	work: () => Promise<T>,
): Promise<T> {
	const priority = await priorityForRun(runId);
	const { requestId } = await enqueue({ userId }, priority);
	const email = await getUserEmail(userId);

	let slotId: number | null = null;
	const deadline = Date.now() + MAX_WAIT_SECONDS * 1000;

	while (Date.now() < deadline) {
		// pipeline.cancel only updates pipelineRun.status — Trigger.dev doesn't
		// re-run checkCancelled on its own when wait.for resumes, so a cancelled
		// run would otherwise sit here until it timed out instead of stopping.
		try {
			await checkCancelled(runId, userId);
		} catch (err) {
			await settleWaitingRequest(requestId, "cancelled");
			throw err;
		}

		const result = await tryAcquireSlot(requestId, email);
		if (result.acquired) {
			slotId = result.slotId;
			break;
		}
		await wait.for({ seconds: POLL_INTERVAL_SECONDS });
	}

	if (slotId === null) {
		logger.warn(
			{ userId, runId },
			"Timed out waiting for a Spotify allowlist slot",
		);
		// Otherwise this request is left `waiting` forever — the partial unique
		// index on userId then blocks any later enqueue() for this user.
		await settleWaitingRequest(
			requestId,
			"failed",
			"Timed out waiting for a free Spotify allowlist slot",
		);
		throw new AllowlistSlotTimeoutError();
	}

	// One more check right before the add — a cancellation landing between
	// acquiring the slot and here shouldn't still kick off the Spotify stage.
	try {
		await checkCancelled(runId, userId);
	} catch (err) {
		await releaseSlot(slotId, { outcome: "cancelled" });
		throw err;
	}

	try {
		await manageAllowlistEntryTask
			.triggerAndWait({ email, action: "add" })
			.unwrap();
	} catch (err) {
		// Never actually landed on the real dashboard — give the slot straight
		// back rather than holding it occupied for timeoutReclaim to notice.
		await releaseSlot(slotId, { outcome: "failed", error: errMessage(err) });
		throw err;
	}

	let result: T;
	try {
		result = await work();
	} catch (workErr) {
		try {
			await manageAllowlistEntryTask
				.triggerAndWait({ email, action: "remove" })
				.unwrap();
			// Removal confirmed clean — free the slot, but record why this
			// request didn't succeed rather than reporting it as "done".
			await releaseSlot(slotId, {
				outcome: "failed",
				error: errMessage(workErr),
			});
		} catch (removeErr) {
			// Don't mask the real failure (`work` itself) with a cleanup failure —
			// manageAllowlistEntryTask already alerts on this independently. The
			// dashboard may still list this email, so leave the slot occupied
			// for the crash-timeout sweep to reclaim and retry, rather than
			// releasing capacity that isn't actually free yet.
			logger.error(
				{ userId, slotId, removeErr },
				"Failed to remove Spotify allowlist entry after a failed stage — leaving the slot occupied for reclaim",
			);
			await failActiveRequestForSlot(slotId, errMessage(workErr));
		}
		throw workErr;
	}

	try {
		await manageAllowlistEntryTask
			.triggerAndWait({ email, action: "remove" })
			.unwrap();
		await releaseSlot(slotId);
	} catch (removeErr) {
		// Same reasoning as above: the stage itself succeeded, so don't let a
		// cleanup failure discard `result` — just leave the slot occupied for
		// reclaim instead of releasing possibly-unfreed capacity.
		logger.error(
			{ userId, slotId, removeErr },
			"Failed to remove Spotify allowlist entry after a completed stage — leaving the slot occupied for reclaim",
		);
		await failActiveRequestForSlot(slotId, errMessage(removeErr));
	}

	return result;
}
