CREATE TABLE "spotify_allowlist_entry" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"user_id" text,
	"waitlist_signup_id" integer,
	"allowlisted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "spotify_allowlist_entry" ADD CONSTRAINT "spotify_allowlist_entry_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spotify_allowlist_entry" ADD CONSTRAINT "spotify_allowlist_entry_waitlist_signup_id_waitlist_signup_id_fk" FOREIGN KEY ("waitlist_signup_id") REFERENCES "public"."waitlist_signup"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "spotify_allowlist_entry_email_unique" ON "spotify_allowlist_entry" USING btree (lower("email"));