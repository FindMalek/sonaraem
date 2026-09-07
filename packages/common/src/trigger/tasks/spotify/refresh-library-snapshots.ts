import { db } from "@sonaraem/db";
import { account } from "@sonaraem/db/schema/auth";
import { userSpotifyLibraryStats } from "@sonaraem/db/schema/spotify";
import { logger } from "@sonaraem/logger";
import { schedules } from "@trigger.dev/sdk";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import pLimit from "p-limit";

import { syncLibraryTracks } from "../../../services/music";
import { withAllowlistSlot } from "../../utils/allowlist-slot";

const REFRESH_CONCURRENCY = 3;

// Same 3-day window syncLibraryTracks itself checks (#284) — this task exists
// to keep that window from going stale for long, so manual/weekly organize
// runs almost always hit the fast (skip-Spotify) path instead of a real sync.
// cron day-of-month field can produce a 1-day gap at month boundaries (e.g.
// 28th -> 31st -> 1st is a 3-day then 1-day gap) — an accepted limitation of
// standard cron syntax, not a "every exactly 72h" guarantee.
export const refreshLibrarySnapshotsTask = schedules.task({
	id: "spotify-refresh-library-snapshots",
	cron: "0 6 */3 * *",
	run: async () => {
		const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

		// Spotify-linked users only — the shared `user` table also holds admin
		// accounts (separate Better Auth instance, no Spotify account row) that
		// have nothing to sync.
		const staleUsers = await db
			.selectDistinct({ userId: account.userId })
			.from(account)
			.leftJoin(
				userSpotifyLibraryStats,
				eq(userSpotifyLibraryStats.userId, account.userId),
			)
			.where(
				and(
					eq(account.providerId, "spotify"),
					or(
						isNull(userSpotifyLibraryStats.lastFullSyncAt),
						lt(userSpotifyLibraryStats.lastFullSyncAt, threeDaysAgo),
					),
					// Skip users with a known-dead connection (#289) — the sync would
					// just fail, and the reactive path already flags them for reauth.
					or(
						isNull(userSpotifyLibraryStats.needsReauth),
						eq(userSpotifyLibraryStats.needsReauth, false),
					),
				),
			);

		if (staleUsers.length === 0) return { refreshed: 0, failed: 0 };

		const limit = pLimit(REFRESH_CONCURRENCY);
		let refreshed = 0;
		let failed = 0;

		await Promise.all(
			staleUsers.map(({ userId }) =>
				limit(async () => {
					try {
						await withAllowlistSlot(userId, { priority: "cron" }, () =>
							syncLibraryTracks(userId),
						);
						refreshed++;
					} catch (err) {
						failed++;
						logger.warn(
							{
								userId,
								error: err instanceof Error ? err.message : String(err),
							},
							"Failed to refresh library snapshot for user",
						);
					}
				}),
			),
		);

		logger.info(
			{ total: staleUsers.length, refreshed, failed },
			"Completed periodic library snapshot refresh",
		);

		return { refreshed, failed };
	},
});
