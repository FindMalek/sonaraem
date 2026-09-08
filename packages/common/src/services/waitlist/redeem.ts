import { createHash } from "node:crypto";
import { db } from "@sonaraem/db";
import { user } from "@sonaraem/db/schema/auth";
import { waitlistSignup } from "@sonaraem/db/schema/waitlist-signup";
import { logger } from "@sonaraem/logger";
import { and, eq, gt, isNull } from "drizzle-orm";

const INVITE_TOKEN_REGEX = /^[0-9a-f]{64}$/;

export type WaitlistInviteIdentity = {
	waitlistSignupId: number;
	spotifyEmail: string;
};

/** Resolves the raw sonaraem_invite cookie to its waitlist signup — used to gate the Spotify OAuth redirect before the user has an account (#392). */
export async function getWaitlistInviteIdentity(
	rawToken: string,
): Promise<WaitlistInviteIdentity | null> {
	if (!INVITE_TOKEN_REGEX.test(rawToken)) return null;

	const hash = createHash("sha256").update(rawToken).digest("hex");
	const [row] = await db
		.select({
			id: waitlistSignup.id,
			spotifyEmail: waitlistSignup.spotifyEmail,
		})
		.from(waitlistSignup)
		.where(
			and(
				eq(waitlistSignup.inviteToken, hash),
				eq(waitlistSignup.status, "approved"),
				isNull(waitlistSignup.inviteRedeemedAt),
				gt(waitlistSignup.inviteTokenExpiresAt, new Date()),
			),
		);

	if (!row?.spotifyEmail) return null;

	return { waitlistSignupId: row.id, spotifyEmail: row.spotifyEmail };
}

/**
 * Atomically marks a waitlist row redeemed by userId and approves that user.
 * False if the row was already redeemed (race lost) or doesn't exist.
 */
export async function redeemWaitlistRow(
	waitlistRowId: number,
	userId: string,
): Promise<boolean> {
	return await db.transaction(async (tx) => {
		const [redeemed] = await tx
			.update(waitlistSignup)
			.set({ inviteRedeemedAt: new Date(), inviteRedeemedByUserId: userId })
			.where(
				and(
					eq(waitlistSignup.id, waitlistRowId),
					isNull(waitlistSignup.inviteRedeemedAt),
				),
			)
			.returning({ id: waitlistSignup.id });

		if (!redeemed) return false;

		await tx.update(user).set({ isApproved: true }).where(eq(user.id, userId));
		return true;
	});
}

/**
 * Auto-approves a user (by id) if their own account email matches an
 * approved, unredeemed waitlist entry — closes the gap where someone never
 * clicked their approval email but was already approved.
 *
 * Security note: Spotify's `/me` profile email is explicitly documented as
 * self-reported and NOT independently re-verified by Spotify for OAuth
 * consumers — Better Auth sets `emailVerified: false` for Spotify sign-ins
 * for exactly this reason. This function still trusts it as a matching
 * signal, which is a deliberate, accepted tradeoff for this app: the
 * approval this grants has low stakes (personal-project waitlist access,
 * not payment or admin rights), and every auto-approval is logged below for
 * after-the-fact review. If Sonaraem's risk profile changes (more users,
 * more valuable access), require an app-controlled verification step (e.g.
 * a confirmation email to the matched address) before trusting this path.
 */
export async function tryAutoApproveByEmail(userId: string): Promise<boolean> {
	const [userRow] = await db
		.select({ email: user.email })
		.from(user)
		.where(eq(user.id, userId));

	if (!userRow?.email) return false;

	const normalizedEmail = userRow.email.trim().toLowerCase();
	const [row] = await db
		.select({ id: waitlistSignup.id })
		.from(waitlistSignup)
		.where(
			and(
				eq(waitlistSignup.email, normalizedEmail),
				eq(waitlistSignup.status, "approved"),
				isNull(waitlistSignup.inviteRedeemedAt),
			),
		)
		.limit(1);

	if (!row) return false;

	const approved = await redeemWaitlistRow(row.id, userId);
	if (approved) {
		logger.info(
			{ userId, waitlistRowId: row.id },
			"Auto-approved from waitlist by Spotify email match",
		);
	}
	return approved;
}
