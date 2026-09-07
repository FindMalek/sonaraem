import {
	index,
	pgEnum,
	pgTable,
	serial,
	text,
	timestamp,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

export const waitlistStatusEnum = pgEnum("waitlist_status", [
	"pending",
	"approved",
	"rejected",
]);

export const waitlistSignup = pgTable(
	"waitlist_signup",
	{
		id: serial("id").primaryKey(),
		email: text("email").notNull().unique(),
		// Nullable — pre-#290 rows have no value to backfill; required for new signups via waitlistSignupInput instead.
		spotifyEmail: text("spotify_email"),
		status: waitlistStatusEnum("status").notNull().default("pending"),
		note: text("note"),
		confirmationEmailSentAt: timestamp("confirmation_email_sent_at"),
		approvedAt: timestamp("approved_at"),
		approvalEmailSentAt: timestamp("approval_email_sent_at"),
		// Invite token for dashboard access gate (sha256 of rawToken)
		inviteToken: text("invite_token").unique(),
		// ponytail: rawToken stored temporarily so poll/retry can re-use same link; cleared after email send
		inviteTokenRaw: text("invite_token_raw"),
		inviteTokenExpiresAt: timestamp("invite_token_expires_at"),
		inviteRedeemedAt: timestamp("invite_redeemed_at"),
		// unique: one Spotify identity can only ever redeem one waitlist invite
		inviteRedeemedByUserId: text("invite_redeemed_by_user_id")
			.unique()
			.references(() => user.id, { onDelete: "set null" }),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(table) => [
		index("waitlist_signup_status_idx").on(table.status),
		index("waitlist_signup_created_at_idx").on(table.createdAt),
		index("waitlist_signup_invite_token_idx").on(table.inviteToken),
	],
);
