/**
 * db-ops migration: correct-spotify-allowlist-entry
 * file: 20260910105613-correct-spotify-allowlist-entry.ts
 * created: 2026-09-10T10:56:13.000Z
 *
 * WHAT
 *   Corrects a mistake in 20260910101858-backfill-spotify-allowlist-entry.ts:
 *   that migration inserted 4 emails as "confirmed allowlisted" based on
 *   each having historically completed Spotify OAuth once, on the stated
 *   assumption that 3 of the 4 would also be manually added to Spotify's
 *   real Developer Dashboard around the same time. Checking the actual
 *   dashboard afterward showed only 1 of the 4 (malekgarahellalbus@gmail.com)
 *   is really there — the other 3 were never actually added. Since this
 *   app's own capacity check only reads spotify_allowlist_entry's row
 *   count (not Spotify's real state), those 3 phantom rows were both
 *   wrongly blocking a real 5th sign-in at "capacity" and would have
 *   caused any of those 3 users' own next reconnect to silently skip the
 *   real Spotify add (since the code no-ops once a row exists) and then
 *   fail at Spotify's own OAuth step instead. Deletes exactly those 3 rows
 *   so the table matches Spotify's dashboard again.
 *
 * PREREQUISITES
 *   - 20260910101858-backfill-spotify-allowlist-entry.ts must have run first
 *
 * RUN (set SONARAEM_DATABASE_URL in .env to the database you want)
 *
 *   Test without writes:
 *     pnpm db:ops:migrate --dry-run --only correct-spotify-allowlist-entry
 *
 *   Apply for real (local dev):
 *     pnpm db:ops:migrate --only correct-spotify-allowlist-entry
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
 *   UPDATE sonaraem_db_ops SET status = 'failed' WHERE name = '20260910105613-correct-spotify-allowlist-entry';
 *   then re-run the Database migrations workflow
 */

import { spotifyAllowlistEntry } from "@sonaraem/db/schema/spotify-allowlist";
import { inArray, sql } from "drizzle-orm";

import type { DbOpsContext } from "../types";

// Not actually on the real Spotify Developer Dashboard, despite each having connected via OAuth at some point in the past — confirmed by hand on 2026-09-10. Lowercased to match how the backfill migration stored them.
const NOT_ACTUALLY_ALLOWLISTED = [
	"marsyrouck@gmail.com",
	"hhassine4747@outlook.com",
	"takoua.zaabi@gmail.com",
].map((email) => email.toLowerCase());

export async function up({ db, log, dryRun }: DbOpsContext): Promise<void> {
	log.info({ dryRun }, "correct-spotify-allowlist-entry: starting");

	const [countRow] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(spotifyAllowlistEntry)
		.where(inArray(spotifyAllowlistEntry.email, NOT_ACTUALLY_ALLOWLISTED));
	const matched = countRow?.count ?? 0;

	if (dryRun) {
		log.info(
			{ matched, wouldDelete: matched },
			"correct-spotify-allowlist-entry: dry-run done",
		);
		return;
	}

	if (matched === 0) {
		log.info(
			{ matched, deleted: 0 },
			"correct-spotify-allowlist-entry: nothing to correct",
		);
		return;
	}

	await db
		.delete(spotifyAllowlistEntry)
		.where(inArray(spotifyAllowlistEntry.email, NOT_ACTUALLY_ALLOWLISTED));

	log.info(
		{ matched, deleted: matched },
		"correct-spotify-allowlist-entry: done",
	);
}
