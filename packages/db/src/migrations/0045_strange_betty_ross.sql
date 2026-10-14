CREATE TYPE "public"."spotify_allowlist_mutation_direction" AS ENUM('add', 'remove');--> statement-breakpoint
CREATE TYPE "public"."spotify_rotation_job_status" AS ENUM('queued', 'dispatched', 'active', 'done', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."spotify_rotation_job_type" AS ENUM('snapshot_refresh', 'export');--> statement-breakpoint
CREATE TYPE "public"."spotify_rotation_status" AS ENUM('on_list', 'off_list');--> statement-breakpoint
CREATE TYPE "public"."waitlist_connect_stage" AS ENUM('not_ready', 'ready_to_connect', 'expired_no_response');--> statement-breakpoint
CREATE TABLE "spotify_allowlist_mutation_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"direction" "spotify_allowlist_mutation_direction" NOT NULL,
	"email" text NOT NULL,
	"occurred_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spotify_rotation_job" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"job_type" "spotify_rotation_job_type" NOT NULL,
	"status" "spotify_rotation_job_status" DEFAULT 'queued' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"eligible_at" timestamp DEFAULT now() NOT NULL,
	"deadline_at" timestamp,
	"playlist_ids" integer[],
	"retry_count" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp,
	"last_error" text,
	"completed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "spotify_allowlist_entry" ADD COLUMN "status" "spotify_rotation_status" DEFAULT 'on_list' NOT NULL;--> statement-breakpoint
ALTER TABLE "spotify_allowlist_entry" ADD COLUMN "last_serviced_at" timestamp;--> statement-breakpoint
ALTER TABLE "spotify_allowlist_entry" ADD COLUMN "next_due_at" timestamp;--> statement-breakpoint
ALTER TABLE "spotify_allowlist_entry" ADD COLUMN "refresh_interval_days" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "waitlist_signup" ADD COLUMN "connect_stage" "waitlist_connect_stage" DEFAULT 'not_ready' NOT NULL;--> statement-breakpoint
ALTER TABLE "waitlist_signup" ADD COLUMN "ready_to_connect_at" timestamp;--> statement-breakpoint
ALTER TABLE "waitlist_signup" ADD COLUMN "connect_reminder_sent_at" timestamp;--> statement-breakpoint
ALTER TABLE "waitlist_signup" ADD COLUMN "connect_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "spotify_rotation_job" ADD CONSTRAINT "spotify_rotation_job_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "spotify_allowlist_mutation_log_direction_occurred_at_idx" ON "spotify_allowlist_mutation_log" USING btree ("direction","occurred_at");--> statement-breakpoint
CREATE INDEX "spotify_rotation_job_status_priority_idx" ON "spotify_rotation_job" USING btree ("status","priority");--> statement-breakpoint
CREATE INDEX "spotify_rotation_job_user_id_status_idx" ON "spotify_rotation_job" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "spotify_allowlist_entry_status_next_due_at_idx" ON "spotify_allowlist_entry" USING btree ("status","next_due_at");--> statement-breakpoint
CREATE INDEX "waitlist_signup_connect_stage_expires_idx" ON "waitlist_signup" USING btree ("connect_stage","connect_expires_at");