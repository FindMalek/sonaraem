import { logger } from "@sonaraem/logger";
import { metadata, task } from "@trigger.dev/sdk";

import { syncLibraryTracks } from "../../../services/music";
import { withAllowlistSlot } from "../../utils/allowlist-slot";

// On-demand, single-user counterpart to refreshLibrarySnapshotsTask (#284),
// which refreshes stale users on a cron off Vercel. This task lets the
// dashboard "sync now" / onboarding import flows trigger the same expensive
// work (paginating Liked Songs + every playlist, normalizing, batched
// upserts) without holding a Vercel Function CPU-active for the whole sync —
// the oRPC handlers trigger this task and relay its progress/result instead
// of calling syncLibraryTracks inline.
export const syncUserLibraryTask = task({
	id: "spotify-sync-user-library",
	run: async ({ userId }: { userId: string }) => {
		const result = await withAllowlistSlot(userId, { priority: "manual" }, () =>
			syncLibraryTracks(userId, async (progress) => {
				metadata.set("progress", progress);
			}),
		);

		logger.info(
			{ userId, total: result.total, done: result.done },
			"Synced user library on demand",
		);

		return result;
	},
});
