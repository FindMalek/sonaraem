CREATE TABLE "spotify_allowlist_session" (
	"id" integer PRIMARY KEY NOT NULL,
	"ciphertext" text NOT NULL,
	"iv" text NOT NULL,
	"auth_tag" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
