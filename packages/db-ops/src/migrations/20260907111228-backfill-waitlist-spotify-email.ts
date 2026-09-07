/**
 * db-ops migration: backfill-waitlist-spotify-email
 * file: 20260907111228-backfill-waitlist-spotify-email.ts
 * created: 2026-09-07T11:12:28.316Z
 *
 * WHAT
 *   Backfills waitlist_signup.spotify_email on every pre-#290 row that has
 *   none (that column was added for the allowlist-gating work and only
 *   populated going forward by waitlistSignupInput). Sets it to the row's
 *   own `email` — the same default the signup API itself now applies when
 *   the field is omitted (see waitlistSignupInput's doc comment) — so every
 *   row is consistent and the #372 login-gating flow has a usable value for
 *   users who signed up before this existed.
 *
 * PREREQUISITES
 *   - waitlist_signup.spotify_email column must exist (Drizzle migration
 *     from #290, already merged)
 *
 * RUN (set SONARAEM_DATABASE_URL in .env to the database you want)
 *
 *   Test without writes:
 *     pnpm db:ops:migrate --dry-run --only backfill-waitlist-spotify-email
 *
 *   Apply for real (local dev):
 *     pnpm db:ops:migrate --only backfill-waitlist-spotify-email
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
 *   UPDATE sonaraem_db_ops SET status = 'failed' WHERE name = '20260907111228-backfill-waitlist-spotify-email';
 *   then re-run the Database migrations workflow
 */

import { waitlistSignup } from "@sonaraem/db/schema/waitlist-signup";
import { isNull, sql } from "drizzle-orm";

import type { DbOpsContext } from "../types";

export async function up({ db, log, dryRun }: DbOpsContext): Promise<void> {
	log.info({ dryRun }, "backfill-waitlist-spotify-email: starting");

	const [countRow] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(waitlistSignup)
		.where(isNull(waitlistSignup.spotifyEmail));
	const pending = countRow?.count ?? 0;

	if (dryRun) {
		log.info(
			{ examined: pending, wouldUpdate: pending, skipped: 0 },
			"backfill-waitlist-spotify-email: dry-run done",
		);
		return;
	}

	if (pending === 0) {
		log.info(
			{ examined: 0, updated: 0 },
			"backfill-waitlist-spotify-email: nothing pending",
		);
		return;
	}

	await db
		.update(waitlistSignup)
		.set({ spotifyEmail: sql`${waitlistSignup.email}` })
		.where(isNull(waitlistSignup.spotifyEmail));

	log.info(
		{ examined: pending, updated: pending },
		"backfill-waitlist-spotify-email: done",
	);
}
