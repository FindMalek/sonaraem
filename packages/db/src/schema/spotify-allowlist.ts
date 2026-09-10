import { sql } from "drizzle-orm";
import {
	index,
	integer,
	pgEnum,
	pgTable,
	serial,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { waitlistSignup } from "./waitlist-signup";

export const spotifyOtpRequestStatusEnum = pgEnum(
	"spotify_otp_request_status",
	["pending", "submitted", "consumed", "expired", "failed"],
);

// code is deleted (not just marked consumed) once used — no reason to retain a spent OTP in plaintext.
export const spotifyOtpRequest = pgTable(
	"spotify_otp_request",
	{
		id: serial("id").primaryKey(),
		requestedAt: timestamp("requested_at").defaultNow().notNull(),
		code: text("code"),
		submittedAt: timestamp("submitted_at"),
		status: spotifyOtpRequestStatusEnum("status").notNull().default("pending"),
	},
	(table) => [
		index("spotify_otp_request_status_idx").on(table.status),
		index("spotify_otp_request_requested_at_idx").on(table.requestedAt),
	],
);

// One row per email permanently added to the real Spotify Dev Mode allowlist (#392) — never removed; 4 rows here + 1 admin-reserved seat (never a row) = Spotify's 5-user cap.
export const spotifyAllowlistEntry = pgTable(
	"spotify_allowlist_entry",
	{
		id: serial("id").primaryKey(),
		email: text("email").notNull(),
		userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
		waitlistSignupId: integer("waitlist_signup_id").references(
			() => waitlistSignup.id,
			{ onDelete: "set null" },
		),
		allowlistedAt: timestamp("allowlisted_at").defaultNow().notNull(),
	},
	(table) => [
		uniqueIndex("spotify_allowlist_entry_email_unique").on(
			sql`lower(${table.email})`,
		),
	],
);

// Single row (id always 1) holding the encrypted Playwright session for the one automation account.
export const spotifyAllowlistSession = pgTable("spotify_allowlist_session", {
	id: integer("id").primaryKey(),
	ciphertext: text("ciphertext").notNull(),
	iv: text("iv").notNull(),
	authTag: text("auth_tag").notNull(),
	// Last time a real add/remove mutation landed on the dashboard — the
	// global throttle manageAllowlistEntryTask enforces between writes so
	// they don't come in bursts across slots. Plaintext; not part of the
	// encrypted session state.
	lastWriteAt: timestamp("last_write_at"),
	// Set on every real automation attempt (add/remove or a standalone health check) — null lastError means the last attempt succeeded.
	lastCheckedAt: timestamp("last_checked_at"),
	lastError: text("last_error"),
	updatedAt: timestamp("updated_at")
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull(),
});
