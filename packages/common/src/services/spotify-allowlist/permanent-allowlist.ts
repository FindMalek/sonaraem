import { db } from "@sonaraem/db";
import { spotifyAllowlistEntry } from "@sonaraem/db/schema/spotify-allowlist";
import { runs } from "@trigger.dev/sdk";
import { eq, sql } from "drizzle-orm";

import { MAX_ALLOWLISTED_REAL_USERS } from "../../constants/spotify-allowlist";
import { manageAllowlistEntryTask } from "../../trigger/tasks/spotify-allowlist/manage-allowlist-entry";

// Provenance for the entry row only — gating itself matches by email (see ensureAllowlisted), same as Spotify's own allowlist.
export type AllowlistIdentity =
	| { userId: string; waitlistSignupId?: undefined }
	| { userId?: undefined; waitlistSignupId: number };

export class AllowlistCapacityError extends Error {
	constructor() {
		super("The Spotify allowlist is at capacity");
		this.name = "AllowlistCapacityError";
	}
}

export type EnsureAllowlistedResult = {
	alreadyAllowlisted: boolean;
};

/** True if `email` is already on the permanent allowlist — lets a reconnect skip the gate with no Spotify call at all. */
export async function isIdentityAllowlisted(email: string): Promise<boolean> {
	const [row] = await db
		.select({ id: spotifyAllowlistEntry.id })
		.from(spotifyAllowlistEntry)
		.where(sql`lower(${spotifyAllowlistEntry.email}) = lower(${email})`);
	return !!row;
}

/**
 * Adds `email` to the real Spotify Dev Mode allowlist and records it as permanent — never removed (#392).
 * A no-op (no Spotify call) if the email is already on record. Throws AllowlistCapacityError before ever
 * calling Spotify once the 4 real-user seats are taken (the 5th is the admin-reserved seat, no row here).
 *
 * The existing-email check, capacity check, and row insert all happen inside one Postgres transaction
 * holding a session-wide advisory lock (`pg_advisory_xact_lock`), so two concurrent sign-ins can't both
 * observe "count < N" before either commits — the second waits for the first's transaction to finish and
 * then re-checks against the committed state. The lock auto-releases at transaction end, so it's never
 * held across the slow, external Spotify dashboard automation call below.
 */
export async function ensureAllowlisted(
	identity: AllowlistIdentity,
	email: string,
): Promise<EnsureAllowlistedResult> {
	const alreadyAllowlisted = await isIdentityAllowlisted(email);
	if (alreadyAllowlisted) return { alreadyAllowlisted: true };

	const reserved = await db.transaction(async (tx) => {
		// Serializes every concurrent admission attempt through one lock — see the doc comment above.
		await tx.execute(
			sql`select pg_advisory_xact_lock(hashtext('sonaraem_spotify_allowlist_capacity'))`,
		);

		const [existing] = await tx
			.select({ id: spotifyAllowlistEntry.id })
			.from(spotifyAllowlistEntry)
			.where(sql`lower(${spotifyAllowlistEntry.email}) = lower(${email})`);
		if (existing) return null;

		const [countRow] = await tx
			.select({ count: sql<number>`count(*)::int` })
			.from(spotifyAllowlistEntry);
		if ((countRow?.count ?? 0) >= MAX_ALLOWLISTED_REAL_USERS) {
			throw new AllowlistCapacityError();
		}

		const [insertedRow] = await tx
			.insert(spotifyAllowlistEntry)
			.values({
				email: email.toLowerCase(),
				userId: identity.userId ?? null,
				waitlistSignupId: identity.waitlistSignupId ?? null,
			})
			.returning({ id: spotifyAllowlistEntry.id });
		return insertedRow ?? null;
	});

	// null means a racing transaction already committed this email while we waited on the lock.
	if (!reserved) return { alreadyAllowlisted: true };

	try {
		// triggerAndWait only works from inside another task's run() — this runs from a plain auth request handler, so trigger + poll is the supported way to wait for the result here.
		const handle = await manageAllowlistEntryTask.trigger({
			email,
			action: "add",
		});
		const result = await runs.poll(handle);
		if (!result.isSuccess) {
			throw new Error(
				result.error?.message ??
					`Spotify allowlist automation run ${result.status.toLowerCase()}`,
			);
		}
	} catch (err) {
		// Don't leave a row claiming Spotify access that was never actually granted.
		await db
			.delete(spotifyAllowlistEntry)
			.where(eq(spotifyAllowlistEntry.id, reserved.id));
		throw err;
	}

	return { alreadyAllowlisted: false };
}
