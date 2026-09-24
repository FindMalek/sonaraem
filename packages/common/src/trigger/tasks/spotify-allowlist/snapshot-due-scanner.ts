import { logger } from "@sonaraem/logger";
import { schedules } from "@trigger.dev/sdk";

import {
	enqueueSnapshotRefresh,
	findDueForRefresh,
} from "../../../services/spotify-allowlist";

/**
 * Replaces the old fixed-3-day refresh-library-snapshots cron (rotation v2,
 * docs/decisions/0001-spotify-allowlist-rotation.md). Deliberately biased
 * toward pull (refresh when a user is active) over push: this scan only
 * catches users who've gone the *entire* refreshIntervalDays without any
 * other reason to be serviced — anyone whose export or on-demand refresh
 * already touched them recently was already pushed past their due date by
 * markRotationEntryServiced, so this never double-enqueues them.
 */
export const snapshotDueScannerTask = schedules.task({
	id: "spotify-snapshot-due-scanner",
	cron: "0 7 * * *",
	run: async () => {
		const due = await findDueForRefresh(50);
		let enqueued = 0;

		for (const { userId } of due) {
			if (!userId) continue;
			await enqueueSnapshotRefresh(userId);
			enqueued++;
		}

		logger.info(
			{ scanned: due.length, enqueued },
			"Completed Spotify snapshot due-date scan",
		);
		return { scanned: due.length, enqueued };
	},
});
