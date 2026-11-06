import { createHash } from "node:crypto";
import { accountDeleteOutputSchema } from "@sonaraem/common/schemas";
import { redeemWaitlistRow } from "@sonaraem/common/services/waitlist";
import { db } from "@sonaraem/db";
import { account, user } from "@sonaraem/db/schema/auth";
import { waitlistSignup } from "@sonaraem/db/schema/waitlist-signup";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { approvedProcedure, protectedProcedure } from "../../procedures";
import { billingRouter } from "./billing";
import { clustersRouter } from "./clusters";
import { emailPreferencesRouter } from "./email-preferences";
import { feedbackRouter } from "./feedback";
import { insightsRouter } from "./insights";
import { pipelineRouter } from "./pipeline";
import { playlistsRouter } from "./playlists";
import { spotifyRouter } from "./spotify";
import { tracksRouter } from "./tracks";

export const protectedRouter = {
	privateData: approvedProcedure.handler(({ context }) => {
		return {
			message: "This is private",
			user: context.session?.user,
		};
	}),
	hasSpotifyLinked: approvedProcedure.handler(async ({ context }) => {
		const userId = context.session.user.id;
		const rows = await db
			.select({ userId: account.userId })
			.from(account)
			.where(and(eq(account.userId, userId), eq(account.providerId, "spotify")))
			.limit(1);
		return { hasSpotify: rows.length > 0 };
	}),
	// Every user-owned table's userId FK is `onDelete: cascade` (session,
	// account, playlist, cluster, userTracks, userEmailPreferences, etc.) —
	// deleting the user row cascades the rest at the DB level. `track` rows
	// themselves are shared across users (not user-scoped), so they're
	// correctly left in place; only this user's link to them is removed.
	deleteAccount: protectedProcedure
		.output(accountDeleteOutputSchema)
		.handler(async ({ context }) => {
			const userId = context.session.user.id;
			await db.delete(user).where(eq(user.id, userId));
			return { success: true };
		}),
	redeemInvite: protectedProcedure
		.input(z.object({ token: z.string().regex(/^[0-9a-f]{64}$/) }))
		.output(z.object({ success: z.boolean() }))
		.handler(async ({ input, context }) => {
			const userId = context.session.user.id;
			const hash = createHash("sha256").update(input.token).digest("hex");

			// One Spotify identity can only ever redeem one invite. Re-check
			// against the DB rather than the session payload — a session can be
			// stale relative to a just-completed redemption. Also closes a
			// farming vector: someone collecting multiple waitlist approvals
			// (e.g. via several emails) can't stack them onto one account.
			const [callingUser] = await db
				.select({ isApproved: user.isApproved, email: user.email })
				.from(user)
				.where(eq(user.id, userId));

			if (callingUser?.isApproved) {
				return { success: false };
			}

			const [row] = await db
				.select({
					id: waitlistSignup.id,
					email: waitlistSignup.email,
					status: waitlistSignup.status,
					inviteTokenExpiresAt: waitlistSignup.inviteTokenExpiresAt,
					inviteRedeemedAt: waitlistSignup.inviteRedeemedAt,
				})
				.from(waitlistSignup)
				.where(eq(waitlistSignup.inviteToken, hash))
				.limit(1);

			// Re-check status here (not just token validity): an admin can reject
			// someone after approving them, and the already-sent email link
			// shouldn't still work even if its token hasn't expired yet.
			//
			// The email match guards against binding the invite to whatever
			// account happens to be signed in when the link is clicked — without
			// it, clicking your invite while signed into a different account
			// permanently strands the waitlist row (#301): inviteRedeemedAt gets
			// stamped on the wrong user with no retry path.
			if (
				row?.status !== "approved" ||
				row?.inviteRedeemedAt ||
				!row?.inviteTokenExpiresAt ||
				row.inviteTokenExpiresAt < new Date() ||
				row.email !== callingUser?.email
			) {
				return { success: false };
			}

			const success = await redeemWaitlistRow(row.id, userId);

			return { success };
		}),
	tracks: tracksRouter,
	clusters: clustersRouter,
	playlists: playlistsRouter,
	pipeline: pipelineRouter,
	spotify: spotifyRouter,
	emailPreferences: emailPreferencesRouter,
	insights: insightsRouter,
	feedback: feedbackRouter,
	billing: billingRouter,
};

export type ProtectedRouter = typeof protectedRouter;
