CREATE TYPE "public"."spotify_allowlist_queue_priority" AS ENUM('manual', 'cron');--> statement-breakpoint
CREATE TYPE "public"."spotify_allowlist_queue_status" AS ENUM('waiting', 'active', 'done', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."spotify_allowlist_slot_status" AS ENUM('available', 'occupied', 'cooldown');--> statement-breakpoint
CREATE TYPE "public"."spotify_otp_request_status" AS ENUM('pending', 'submitted', 'consumed', 'expired', 'failed');--> statement-breakpoint
CREATE TABLE "spotify_allowlist_queue_request" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"waitlist_signup_id" integer,
	"priority" "spotify_allowlist_queue_priority" NOT NULL,
	"status" "spotify_allowlist_queue_status" DEFAULT 'waiting' NOT NULL,
	"slot_id" integer,
	"pipeline_run_id" integer,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"activated_at" timestamp,
	"completed_at" timestamp,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "spotify_allowlist_slot" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"status" "spotify_allowlist_slot_status" DEFAULT 'available' NOT NULL,
	"occupied_at" timestamp,
	"released_at" timestamp,
	"cooldown_until" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spotify_otp_request" (
	"id" serial PRIMARY KEY NOT NULL,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"code" text,
	"submitted_at" timestamp,
	"status" "spotify_otp_request_status" DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "waitlist_signup" ADD COLUMN "spotify_email" text;--> statement-breakpoint
ALTER TABLE "spotify_allowlist_queue_request" ADD CONSTRAINT "spotify_allowlist_queue_request_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spotify_allowlist_queue_request" ADD CONSTRAINT "spotify_allowlist_queue_request_waitlist_signup_id_waitlist_signup_id_fk" FOREIGN KEY ("waitlist_signup_id") REFERENCES "public"."waitlist_signup"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spotify_allowlist_queue_request" ADD CONSTRAINT "spotify_allowlist_queue_request_slot_id_spotify_allowlist_slot_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."spotify_allowlist_slot"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spotify_allowlist_queue_request" ADD CONSTRAINT "spotify_allowlist_queue_request_pipeline_run_id_pipeline_run_id_fk" FOREIGN KEY ("pipeline_run_id") REFERENCES "public"."pipeline_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spotify_allowlist_slot" ADD CONSTRAINT "spotify_allowlist_slot_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "spotify_allowlist_queue_request_status_priority_idx" ON "spotify_allowlist_queue_request" USING btree ("status","priority","requested_at");--> statement-breakpoint
CREATE INDEX "spotify_allowlist_queue_request_user_id_idx" ON "spotify_allowlist_queue_request" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "spotify_allowlist_queue_request_waitlist_signup_id_idx" ON "spotify_allowlist_queue_request" USING btree ("waitlist_signup_id");--> statement-breakpoint
CREATE UNIQUE INDEX "spotify_allowlist_queue_request_one_live_per_user" ON "spotify_allowlist_queue_request" USING btree ("user_id") WHERE "spotify_allowlist_queue_request"."status" in ('waiting', 'active');--> statement-breakpoint
CREATE UNIQUE INDEX "spotify_allowlist_queue_request_one_live_per_waitlist_signup" ON "spotify_allowlist_queue_request" USING btree ("waitlist_signup_id") WHERE "spotify_allowlist_queue_request"."status" in ('waiting', 'active');--> statement-breakpoint
CREATE INDEX "spotify_allowlist_slot_user_id_idx" ON "spotify_allowlist_slot" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "spotify_allowlist_slot_status_idx" ON "spotify_allowlist_slot" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "spotify_allowlist_slot_one_occupied_per_user" ON "spotify_allowlist_slot" USING btree ("user_id") WHERE "spotify_allowlist_slot"."status" = 'occupied';--> statement-breakpoint
CREATE INDEX "spotify_otp_request_status_idx" ON "spotify_otp_request" USING btree ("status");--> statement-breakpoint
CREATE INDEX "spotify_otp_request_requested_at_idx" ON "spotify_otp_request" USING btree ("requested_at");--> statement-breakpoint
-- Seed the 4-slot rotation pool (#290). Deliberately 4, not 5 — the 5th Dev
-- Mode allowlist entry is reserved for the admin's own dashboard access and
-- is never represented as a row in this table. Guarded so this migration
-- stays safe to run more than once.
INSERT INTO "spotify_allowlist_slot" ("status")
SELECT 'available' FROM generate_series(1, 4)
WHERE NOT EXISTS (SELECT 1 FROM "spotify_allowlist_slot");