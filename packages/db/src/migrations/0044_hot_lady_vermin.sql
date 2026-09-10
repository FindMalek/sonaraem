ALTER TABLE "spotify_allowlist_session" ADD COLUMN "last_checked_at" timestamp;--> statement-breakpoint
ALTER TABLE "spotify_allowlist_session" ADD COLUMN "last_error" text;