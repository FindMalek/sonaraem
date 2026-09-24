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

// ADD and REMOVE are throttled as two separate rolling-24h budgets (docs/decisions/0001), tracked as two independent sliding windows over this one log.
export const spotifyAllowlistMutationDirectionEnum = pgEnum(
	"spotify_allowlist_mutation_direction",
	["add", "remove"],
);

// Append-only log backing the rolling-24h rate limiter — never trimmed; a mutation older than 24h is just excluded from the window count.
export const spotifyAllowlistMutationLog = pgTable(
	"spotify_allowlist_mutation_log",
	{
		id: serial("id").primaryKey(),
		direction: spotifyAllowlistMutationDirectionEnum("direction").notNull(),
		email: text("email").notNull(),
		occurredAt: timestamp("occurred_at").defaultNow().notNull(),
	},
	(table) => [
		index("spotify_allowlist_mutation_log_direction_occurred_at_idx").on(
			table.direction,
			table.occurredAt,
		),
	],
);

// A user's current position in the rotation — never deleted, even while off-list (docs/decisions/0001).
export const spotifyRotationStatusEnum = pgEnum("spotify_rotation_status", [
	"on_list",
	"off_list",
]);

// Async background work waiting for a rotation seat — excludes onboarding, which adds synchronously inside the OAuth redirect hook; this table is only for already-onboarded, off-list users needing a seat again.
export const spotifyRotationJobTypeEnum = pgEnum("spotify_rotation_job_type", [
	"snapshot_refresh",
	"export",
]);

export const spotifyRotationJobStatusEnum = pgEnum(
	"spotify_rotation_job_status",
	["queued", "dispatched", "active", "done", "failed", "cancelled"],
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

// One row per email ever admitted — never deleted (rotation v2, docs/decisions/0001, supersedes #392's permanent model). `status` tracks whether it occupies one of the 4 rotating seats; `lastServicedAt`/`nextDueAt` drive the due-date scanner and the consolidation rule (any successful visit bumps both).
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
		status: spotifyRotationStatusEnum("status").notNull().default("on_list"),
		lastServicedAt: timestamp("last_serviced_at"),
		nextDueAt: timestamp("next_due_at"),
		// Per-user cadence (default matches docs/decisions/0001's baseline) — lower for a future "active tier" rather than changing the system-wide default.
		refreshIntervalDays: integer("refresh_interval_days").notNull().default(30),
	},
	(table) => [
		uniqueIndex("spotify_allowlist_entry_email_unique").on(
			sql`lower(${table.email})`,
		),
		index("spotify_allowlist_entry_status_next_due_at_idx").on(
			table.status,
			table.nextDueAt,
		),
	],
);

export const spotifyRotationJob = pgTable(
	"spotify_rotation_job",
	{
		id: serial("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		jobType: spotifyRotationJobTypeEnum("job_type").notNull(),
		status: spotifyRotationJobStatusEnum("status").notNull().default("queued"),
		priority: integer("priority").notNull().default(0),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		eligibleAt: timestamp("eligible_at").defaultNow().notNull(),
		deadlineAt: timestamp("deadline_at"),
		// Only meaningful for jobType 'export' — the specific playlists requested.
		playlistIds: integer("playlist_ids").array(),
		retryCount: integer("retry_count").notNull().default(0),
		lastAttemptAt: timestamp("last_attempt_at"),
		lastError: text("last_error"),
		completedAt: timestamp("completed_at"),
	},
	(table) => [
		index("spotify_rotation_job_status_priority_idx").on(
			table.status,
			table.priority,
		),
		index("spotify_rotation_job_user_id_status_idx").on(
			table.userId,
			table.status,
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
