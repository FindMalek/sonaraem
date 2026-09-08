import { db } from "@sonaraem/db";
import { spotifyAllowlistEntry } from "@sonaraem/db/schema/spotify-allowlist";
import { sql } from "drizzle-orm";

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
 * The capacity check and insert aren't atomic — an accepted race for this app's scale (a handful of rare
 * sign-ins); the email-level unique index still prevents a duplicate row for the same email either way.
 */
export async function ensureAllowlisted(
	identity: AllowlistIdentity,
	email: string,
): Promise<EnsureAllowlistedResult> {
	const alreadyAllowlisted = await isIdentityAllowlisted(email);
	if (alreadyAllowlisted) return { alreadyAllowlisted: true };

	const [row] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(spotifyAllowlistEntry);
	if ((row?.count ?? 0) >= MAX_ALLOWLISTED_REAL_USERS) {
		throw new AllowlistCapacityError();
	}

	await manageAllowlistEntryTask
		.triggerAndWait({ email, action: "add" })
		.unwrap();

	try {
		await db.insert(spotifyAllowlistEntry).values({
			email: email.toLowerCase(),
			userId: identity.userId ?? null,
			waitlistSignupId: identity.waitlistSignupId ?? null,
		});
	} catch (err) {
		// Unique-violation here means another request just won the same race — the email is allowlisted either way.
		if (!isUniqueEmailConflict(err)) throw err;
	}

	return { alreadyAllowlisted: false };
}

function isUniqueEmailConflict(err: unknown): boolean {
	const asRecord = (v: unknown) =>
		typeof v === "object" && v !== null
			? (v as { code?: string; constraint?: string; cause?: unknown })
			: undefined;
	const isViolation = (r?: { code?: string; constraint?: string }) =>
		r?.code === "23505" &&
		r?.constraint === "spotify_allowlist_entry_email_unique";
	const direct = asRecord(err);
	return isViolation(direct) || isViolation(asRecord(direct?.cause));
}
