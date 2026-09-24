import { db } from "@sonaraem/db";
import { user } from "@sonaraem/db/schema/auth";
import { spotifyAllowlistEntry } from "@sonaraem/db/schema/spotify-allowlist";
import { and, eq, isNull, lte, sql } from "drizzle-orm";

export type RotationEntry = {
	id: number;
	email: string;
	status: "on_list" | "off_list";
	refreshIntervalDays: number;
	lastServicedAt: Date | null;
};

export async function getRotationEntryByUserId(
	userId: string,
): Promise<RotationEntry | null> {
	const [row] = await db
		.select({
			id: spotifyAllowlistEntry.id,
			email: spotifyAllowlistEntry.email,
			status: spotifyAllowlistEntry.status,
			refreshIntervalDays: spotifyAllowlistEntry.refreshIntervalDays,
			lastServicedAt: spotifyAllowlistEntry.lastServicedAt,
		})
		.from(spotifyAllowlistEntry)
		.where(eq(spotifyAllowlistEntry.userId, userId))
		.limit(1);
	return row ?? null;
}

/**
 * A first-time invite admission (ensureAllowlisted, gated by waitlistSignupId
 * before any account exists) inserts the entry with userId null — nothing
 * else ever backfills it once the real account is created, which left
 * getRotationEntryByUserId unable to find the row for the app's primary
 * onboarding path. Call once the account exists (auth's account.create.after)
 * to link the row by matching email, not by waitlistSignupId, since that
 * stays correct even if the account's own email differs slightly in case.
 */
export async function backfillAllowlistEntryUserId(
	accountUserId: string,
): Promise<void> {
	const [account] = await db
		.select({ email: user.email })
		.from(user)
		.where(eq(user.id, accountUserId));
	if (!account?.email) return;

	await db
		.update(spotifyAllowlistEntry)
		.set({ userId: accountUserId })
		.where(
			and(
				isNull(spotifyAllowlistEntry.userId),
				sql`lower(${spotifyAllowlistEntry.email}) = lower(${account.email})`,
			),
		);
}

export async function markRotationEntryOnList(id: number): Promise<void> {
	await db
		.update(spotifyAllowlistEntry)
		.set({ status: "on_list" })
		.where(eq(spotifyAllowlistEntry.id, id));
}

/** Plain status revert for a failed add after reserving the seat — unlike markRotationEntryServiced, does not touch lastServicedAt/nextDueAt, since no real visit happened. */
export async function markRotationEntryOffList(id: number): Promise<void> {
	await db
		.update(spotifyAllowlistEntry)
		.set({ status: "off_list" })
		.where(eq(spotifyAllowlistEntry.id, id));
}

/**
 * Call once all queued work for this user's session is actually done —
 * resets the due-date clock regardless of which job type triggered the
 * visit (docs/decisions/0001's consolidation rule: any successful touch
 * counts, so this user isn't re-added for a second reason shortly after).
 */
export async function markRotationEntryServiced(
	id: number,
	refreshIntervalDays: number,
): Promise<void> {
	const now = new Date();
	const nextDueAt = new Date(
		now.getTime() + refreshIntervalDays * 24 * 60 * 60 * 1000,
	);
	await db
		.update(spotifyAllowlistEntry)
		.set({ status: "off_list", lastServicedAt: now, nextDueAt })
		.where(eq(spotifyAllowlistEntry.id, id));
}

/** Dormant (off-list) users whose scheduled refresh is due — feeds the daily due-date scanner. */
export async function findDueForRefresh(
	limit = 50,
): Promise<Array<{ userId: string | null }>> {
	return db
		.select({ userId: spotifyAllowlistEntry.userId })
		.from(spotifyAllowlistEntry)
		.where(
			and(
				eq(spotifyAllowlistEntry.status, "off_list"),
				lte(spotifyAllowlistEntry.nextDueAt, new Date()),
			),
		)
		.limit(limit);
}
