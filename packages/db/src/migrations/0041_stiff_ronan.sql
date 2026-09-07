CREATE TYPE "public"."spotify_allowlist_slot_kind" AS ENUM('rotation', 'login');--> statement-breakpoint
ALTER TYPE "public"."spotify_allowlist_queue_priority" ADD VALUE 'login' BEFORE 'manual';--> statement-breakpoint
ALTER TABLE "spotify_allowlist_slot" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "spotify_allowlist_slot" ALTER COLUMN "status" SET DEFAULT 'available'::text;--> statement-breakpoint
DROP TYPE "public"."spotify_allowlist_slot_status";--> statement-breakpoint
CREATE TYPE "public"."spotify_allowlist_slot_status" AS ENUM('available', 'occupied', 'reclaiming');--> statement-breakpoint
ALTER TABLE "spotify_allowlist_slot" ALTER COLUMN "status" SET DEFAULT 'available'::"public"."spotify_allowlist_slot_status";--> statement-breakpoint
ALTER TABLE "spotify_allowlist_slot" ALTER COLUMN "status" SET DATA TYPE "public"."spotify_allowlist_slot_status" USING "status"::"public"."spotify_allowlist_slot_status";--> statement-breakpoint
DROP INDEX "spotify_allowlist_slot_status_idx";--> statement-breakpoint
ALTER TABLE "spotify_allowlist_session" ADD COLUMN "last_write_at" timestamp;--> statement-breakpoint
ALTER TABLE "spotify_allowlist_slot" ADD COLUMN "kind" "spotify_allowlist_slot_kind" DEFAULT 'rotation' NOT NULL;--> statement-breakpoint
CREATE INDEX "spotify_allowlist_slot_status_kind_idx" ON "spotify_allowlist_slot" USING btree ("status","kind");--> statement-breakpoint
ALTER TABLE "spotify_allowlist_slot" DROP COLUMN "cooldown_until";