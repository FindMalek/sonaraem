import { db } from "@sonaraem/db";
import { spotifyAllowlistEntry } from "@sonaraem/db/schema/spotify-allowlist";
import { eq, sql } from "drizzle-orm";

import { MAX_ALLOWLISTED_REAL_USERS } from "../../constants/spotify-allowlist";
import { runAllowlistMutation } from "./mutate";
import { markRotationEntryOffList } from "./rotation-entry";

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

/** True if `email` currently occupies a rotating seat — lets a reconnect skip the gate with no Spotify call at all. An `off_list` row (rotation-v2: serviced and released) does NOT count — it's not currently on Spotify's real allowlist and needs a fresh add. */
export async function isIdentityAllowlisted(email: string): Promise<boolean> {
	const [row] = await db
		.select({ status: spotifyAllowlistEntry.status })
		.from(spotifyAllowlistEntry)
		.where(sql`lower(${spotifyAllowlistEntry.email}) = lower(${email})`);
	return row?.status === "on_list";
}

/**
 * Adds `email` to the real Spotify Dev Mode allowlist (rotation-v2, docs/decisions/0001 — supersedes
 * #392's permanent model). A no-op (no Spotify call) if the email already occupies a rotating seat.
 * Throws AllowlistCapacityError before ever calling Spotify once all `MAX_ALLOWLISTED_REAL_USERS` seats
 * are currently `on_list` (the 5th real seat is the admin-reserved one, no row here) — a row that exists
 * but is `off_list` (already serviced and released by the rotation dispatcher) does NOT count against
 * capacity and gets reactivated rather than re-inserted.
 *
 * The existing-email check, capacity check, and row insert/reactivate all happen inside one Postgres
 * transaction holding a session-wide advisory lock (`pg_advisory_xact_lock`), so two concurrent sign-ins
 * can't both observe "count < N" before either commits — the second waits for the first's transaction to
 * finish and then re-checks against the committed state. The lock auto-releases at transaction end, so
 * it's never held across the slow, external Spotify dashboard automation call below.
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
			.select({
				id: spotifyAllowlistEntry.id,
				status: spotifyAllowlistEntry.status,
			})
			.from(spotifyAllowlistEntry)
			.where(sql`lower(${spotifyAllowlistEntry.email}) = lower(${email})`);
		// A racing transaction already reactivated/inserted this email while we waited on the lock.
		if (existing?.status === "on_list") return null;

		const [countRow] = await tx
			.select({ count: sql<number>`count(*)::int` })
			.from(spotifyAllowlistEntry)
			.where(eq(spotifyAllowlistEntry.status, "on_list"));
		if ((countRow?.count ?? 0) >= MAX_ALLOWLISTED_REAL_USERS) {
			throw new AllowlistCapacityError();
		}

		if (existing) {
			// Reactivate in place (unique index on email rejects a duplicate insert); inlined, not markRotationEntryOnList, since that runs against the module-level `db` and this must stay inside THIS transaction.
			await tx
				.update(spotifyAllowlistEntry)
				.set({ status: "on_list" })
				.where(eq(spotifyAllowlistEntry.id, existing.id));
			return { id: existing.id, reactivated: true as const };
		}

		const [insertedRow] = await tx
			.insert(spotifyAllowlistEntry)
			.values({
				email: email.toLowerCase(),
				userId: identity.userId ?? null,
				waitlistSignupId: identity.waitlistSignupId ?? null,
			})
			.returning({ id: spotifyAllowlistEntry.id });
		return insertedRow
			? { id: insertedRow.id, reactivated: false as const }
			: null;
	});

	// null means a racing transaction already committed this email while we waited on the lock.
	if (!reserved) return { alreadyAllowlisted: true };

	try {
		await runAllowlistMutation(email, "add");
	} catch (err) {
		if (reserved.reactivated) {
			// Real onboarding history, not a failed create — roll status back instead of deleting. Not inside the transaction here, so free to reuse the shared helper.
			await markRotationEntryOffList(reserved.id);
		} else {
			// Don't leave a row claiming Spotify access that was never actually granted.
			await db
				.delete(spotifyAllowlistEntry)
				.where(eq(spotifyAllowlistEntry.id, reserved.id));
		}
		throw err;
	}

	return { alreadyAllowlisted: false };
}
