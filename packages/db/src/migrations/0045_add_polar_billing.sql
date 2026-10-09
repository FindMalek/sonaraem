ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "plan" text DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "plan_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "polar_customer_id" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "polar_subscription_id" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_polar_customer_id_idx" ON "user" USING btree ("polar_customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_polar_subscription_id_idx" ON "user" USING btree ("polar_subscription_id");
