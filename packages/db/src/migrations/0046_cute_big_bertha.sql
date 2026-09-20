DROP INDEX "waitlist_signup_connect_stage_expires_idx";--> statement-breakpoint
ALTER TABLE "waitlist_signup" DROP COLUMN "connect_stage";--> statement-breakpoint
ALTER TABLE "waitlist_signup" DROP COLUMN "ready_to_connect_at";--> statement-breakpoint
ALTER TABLE "waitlist_signup" DROP COLUMN "connect_reminder_sent_at";--> statement-breakpoint
ALTER TABLE "waitlist_signup" DROP COLUMN "connect_expires_at";--> statement-breakpoint
DROP TYPE "public"."waitlist_connect_stage";