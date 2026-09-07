import { allowlistQueueAdminOutputSchema } from "@sonaraem/common/schemas";
import { db } from "@sonaraem/db";
import { user } from "@sonaraem/db/schema/auth";
import {
	spotifyAllowlistQueueRequest,
	spotifyAllowlistSlot,
} from "@sonaraem/db/schema/spotify-allowlist";
import { waitlistSignup } from "@sonaraem/db/schema/waitlist-signup";
import { asc, desc, eq } from "drizzle-orm";
import { adminProcedure } from "../../procedures";

const RECENT_REQUESTS_LIMIT = 100;

export const adminSpotifyAllowlistQueueRouter = {
	list: adminProcedure
		.output(allowlistQueueAdminOutputSchema)
		.handler(async () => {
			const [slots, requestRows] = await Promise.all([
				db
					.select({
						id: spotifyAllowlistSlot.id,
						kind: spotifyAllowlistSlot.kind,
						status: spotifyAllowlistSlot.status,
						email: spotifyAllowlistSlot.email,
						occupiedAt: spotifyAllowlistSlot.occupiedAt,
						releasedAt: spotifyAllowlistSlot.releasedAt,
					})
					.from(spotifyAllowlistSlot)
					.orderBy(asc(spotifyAllowlistSlot.id)),

				db
					.select({
						id: spotifyAllowlistQueueRequest.id,
						priority: spotifyAllowlistQueueRequest.priority,
						status: spotifyAllowlistQueueRequest.status,
						email: spotifyAllowlistQueueRequest.email,
						requestedAt: spotifyAllowlistQueueRequest.requestedAt,
						activatedAt: spotifyAllowlistQueueRequest.activatedAt,
						completedAt: spotifyAllowlistQueueRequest.completedAt,
						error: spotifyAllowlistQueueRequest.error,
						userName: user.name,
						userEmail: user.email,
						waitlistEmail: waitlistSignup.email,
					})
					.from(spotifyAllowlistQueueRequest)
					.leftJoin(user, eq(spotifyAllowlistQueueRequest.userId, user.id))
					.leftJoin(
						waitlistSignup,
						eq(
							spotifyAllowlistQueueRequest.waitlistSignupId,
							waitlistSignup.id,
						),
					)
					.orderBy(desc(spotifyAllowlistQueueRequest.requestedAt))
					.limit(RECENT_REQUESTS_LIMIT),
			]);

			const requests = requestRows.map((row) => ({
				id: row.id,
				identityLabel: row.userName
					? `${row.userName} (${row.userEmail})`
					: (row.waitlistEmail ?? "unknown"),
				priority: row.priority,
				status: row.status,
				email: row.email,
				requestedAt: row.requestedAt,
				activatedAt: row.activatedAt,
				completedAt: row.completedAt,
				error: row.error,
			}));

			return { slots, requests };
		}),
};
