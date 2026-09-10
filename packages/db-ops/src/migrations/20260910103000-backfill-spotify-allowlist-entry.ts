/**
 * db-ops migration: backfill-spotify-allowlist-entry
 * file: 20260910103000-backfill-spotify-allowlist-entry.ts
 * created: 2026-09-10T10:30:00.000Z
 *
 * WHAT
 *   #394's migration 0043 dropped spotify_allowlist_slot and
 *   spotify_allowlist_queue_request (the old rotation system) with no
 *   backfill into the new spotify_allowlist_entry table. This inserts the 4
 *   real users confirmed (by hand, against the actual Spotify Developer
 *   Dashboard, not inferred from waitlist status) to still be genuinely
 *   allowlisted on Spotify right now. A 5th historical connection,
 *   sadfrags@gmail.com, is deliberately excluded — it was the throwaway
 *   account used to discover the #390 ADD-rate-limit, not a real user, and
 *   is being removed from Spotify's dashboard by hand alongside this.
 *
 * PREREQUISITES
 *   - spotify_allowlist_entry table must exist (Drizzle migration 0042,
 *     already merged in #394)
 *   - The 4 user_id values below must still exist in the user table
 *
 * RUN (set SONARAEM_DATABASE_URL in .env to the database you want)
 *
 *   Test without writes:
 *     pnpm db:ops:migrate --dry-run --only backfill-spotify-allowlist-entry
 *
 *   Apply for real (local dev):
 *     pnpm db:ops:migrate --only backfill-spotify-allowlist-entry
 *
 *   Prod: merge PR — CI runs pnpm db:ops:migrate (no --dry-run)
 *
 * OTHER
 *   pnpm db:ops:status
 *   pnpm db:reset   (truncates sonaraem_db_ops locally)
 *
 * AUTHOR RULES
 *   - Handle dryRun in up() — reads OK, no writes when dryRun is true
 *   - Idempotent: safe if retried after a crash before the ledger marks completed
 *   - No DDL here — CREATE/ALTER/DROP belongs in Drizzle schema migrations
 *   - Never edit this file after it is completed in prod — checksum mismatch fails CI
 *
 * ESCAPE HATCH (prod, rare)
 *   UPDATE sonaraem_db_ops SET status = 'failed' WHERE name = '20260910103000-backfill-spotify-allowlist-entry';
 *   then re-run the Database migrations workflow
 */

import { user } from "@sonaraem/db/schema/auth";
import { spotifyAllowlistEntry } from "@sonaraem/db/schema/spotify-allowlist";
import { eq, sql } from "drizzle-orm";

import type { DbOpsContext } from "../types";

// Confirmed by hand against the real Spotify Developer Dashboard on 2026-09-10 — not inferred from waitlist_signup.status, which only reflects invite approval, not actual Spotify allowlist presence.
const CONFIRMED_REAL_USERS: Array<{ email: string; userId: string }> = [
	{
		email: "malekgarahellalbus@gmail.com",
		userId: "UpJ1HwUY8FBzkBTFpooMiaPTG0F8tDBt",
	},
	{ email: "marsyrouck@gmail.com", userId: "kVkJGHym0Qtwqs9RqtRmg2LtSUwXPKIK" },
	{
		email: "hhassine4747@outlook.com",
		userId: "jFJhs6ywIBZQvokpF7ofuuqkcILa2d6I",
	},
	{
		email: "takoua.zaabi@gmail.com",
		userId: "2Nsq7Zo3GGljGwWc4rUNoNPLmEfePdtV",
	},
];

export async function up({ db, log, dryRun }: DbOpsContext): Promise<void> {
	log.info({ dryRun }, "backfill-spotify-allowlist-entry: starting");

	let inserted = 0;
	let skippedExisting = 0;
	let skippedMissingUser = 0;

	for (const candidate of CONFIRMED_REAL_USERS) {
		const [existingEntry] = await db
			.select({ id: spotifyAllowlistEntry.id })
			.from(spotifyAllowlistEntry)
			.where(
				sql`lower(${spotifyAllowlistEntry.email}) = lower(${candidate.email})`,
			);
		if (existingEntry) {
			skippedExisting++;
			continue;
		}

		const [existingUser] = await db
			.select({ id: user.id })
			.from(user)
			.where(eq(user.id, candidate.userId));
		if (!existingUser) {
			log.error(
				{ email: candidate.email, userId: candidate.userId },
				"backfill-spotify-allowlist-entry: user_id no longer exists, skipping",
			);
			skippedMissingUser++;
			continue;
		}

		if (dryRun) {
			log.info(
				{ email: candidate.email, userId: candidate.userId },
				"backfill-spotify-allowlist-entry: would insert",
			);
			inserted++;
			continue;
		}

		await db.insert(spotifyAllowlistEntry).values({
			email: candidate.email.toLowerCase(),
			userId: candidate.userId,
		});
		inserted++;
	}

	log.info(
		{ inserted, skippedExisting, skippedMissingUser, dryRun },
		"backfill-spotify-allowlist-entry: done",
	);
}
