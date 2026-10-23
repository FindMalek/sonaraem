import { logger } from "@sonaraem/logger";
import type { Queue } from "@trigger.dev/sdk";
import { queue, schedules } from "@trigger.dev/sdk";

import {
	exportPlaylistToSpotify,
	syncLibraryTracks,
} from "../../../services/music";
import {
	getNextConsolidatedBatch,
	getRotationEntryByUserId,
	markJobsDone,
	markJobsFailed,
	markRotationEntryOffList,
	markRotationEntryServiced,
	requeueForBudget,
	reserveRotationSeat,
	runAllowlistMutation,
} from "../../../services/spotify-allowlist";
import { isBudgetExhaustedMessage } from "./manage-allowlist-entry";

// Serialize dispatch runs — the Playwright worker is already concurrency:1, but this keeps "pick a batch, mark it dispatched" atomic against overlapping cron fires without a DB-level lock.
const rotationDispatcherQueue: Queue = queue({
	name: "spotify-rotation-dispatcher",
	concurrencyLimit: 1,
});

/**
 * The core rotation-v2 loop (docs/decisions/0001-spotify-allowlist-rotation.md):
 * pick the highest-priority consolidated batch of pending work for one user,
 * add them, do everything queued for them in one visit, remove them, record
 * the new due-date. Never opens a second session for a user who already has
 * a session running — getNextConsolidatedBatch guarantees that by pulling in
 * every queued job for that user before dispatching any of them.
 *
 * Exported as a plain function (not just via the task wrapper below) so it's
 * directly callable from tests — @trigger.dev/sdk's Task type doesn't expose
 * `.run` publicly.
 */
export async function dispatchNextRotationBatch() {
	const batch = await getNextConsolidatedBatch();
	if (!batch) return { dispatched: false };

	const jobIds = batch.jobs.map((j) => j.id);

	try {
		const entry = await getRotationEntryByUserId(batch.userId);
		if (!entry) {
			throw new Error(
				`No spotify_allowlist_entry found for user ${batch.userId} — cannot rotate a user who was never onboarded`,
			);
		}

		// Idempotent if already on-list for some other reason — never re-add what's already added.
		if (entry.status !== "on_list") {
			// Same locked, capacity-rechecked reservation ensureAllowlisted uses — a plain unlocked flip here could race a concurrent sign-in and overshoot the seat cap.
			const seatReserved = await reserveRotationSeat(entry.id);
			if (!seatReserved) {
				await requeueForBudget(jobIds);
				logger.info(
					{ userId: batch.userId, jobIds },
					"Rotation batch waiting on a free seat, requeued",
				);
				return { dispatched: false, waitingOnBudget: true };
			}
			try {
				await runAllowlistMutation(entry.email, "add");
			} catch (err) {
				await markRotationEntryOffList(entry.id);
				throw err;
			}
		}

		for (const job of batch.jobs) {
			if (job.jobType === "snapshot_refresh") {
				await syncLibraryTracks(batch.userId);
			} else if (job.jobType === "export") {
				for (const playlistId of job.playlistIds ?? []) {
					await exportPlaylistToSpotify(batch.userId, playlistId);
				}
				// TODO(docs/decisions/0001, phase 3, #410): send the "here's what got exported" email once the template exists.
			}
		}

		await runAllowlistMutation(entry.email, "remove");
		await markRotationEntryServiced(entry.id, entry.refreshIntervalDays);

		await markJobsDone(jobIds);
		logger.info(
			{ userId: batch.userId, jobTypes: batch.jobs.map((j) => j.jobType) },
			"Completed consolidated Spotify rotation session",
		);
		return {
			dispatched: true,
			userId: batch.userId,
			jobCount: jobIds.length,
		};
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		if (isBudgetExhaustedMessage(message)) {
			await requeueForBudget(jobIds);
			logger.info(
				{ userId: batch.userId, jobIds },
				"Rotation batch waiting on mutation budget, requeued",
			);
			return { dispatched: false, waitingOnBudget: true };
		}
		logger.error(
			{ userId: batch.userId, jobIds, error: message },
			"Spotify rotation dispatch failed",
		);
		await markJobsFailed(jobIds, message);
		// Don't rethrow — already requeued (with backoff) or marked failed by markJobsFailed; the next tick picks up whatever's next.
		return { dispatched: false, error: message };
	}
}

export const rotationDispatcherTask = schedules.task({
	id: "spotify-allowlist-rotation-dispatcher",
	cron: "*/15 * * * *",
	queue: rotationDispatcherQueue,
	run: dispatchNextRotationBatch,
});
