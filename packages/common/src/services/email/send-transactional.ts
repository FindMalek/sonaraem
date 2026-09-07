import { randomUUID } from "node:crypto";

import type { CreatedPlaylist } from "@sonaraem/common/schemas";
import { DASHBOARD_ROUTES } from "@sonaraem/common/utils/routes";
import { db } from "@sonaraem/db";
import { user } from "@sonaraem/db/schema/auth";
import { pipelineRun } from "@sonaraem/db/schema/pipeline-run";
import { playlist } from "@sonaraem/db/schema/playlist";
import {
	sendFeedback3DayEmail,
	sendOrganizeCompleteEmail,
	sendOrganizeWeeklyDigestEmail,
	sendSpotifyAllowlistFailedEmail,
	sendSpotifyReauthEmail,
	sendWelcomeEmail,
} from "@sonaraem/email/send";
import { env } from "@sonaraem/env/server";
import { logger } from "@sonaraem/logger";
import { and, desc, eq } from "drizzle-orm";

import { markEmailDelivery, reserveEmailDelivery } from "./dedupe";
import { evaluateEmailPolicy } from "./policy";

function buildSendConfig() {
	if (!env.SONARAEM_RESEND_API_KEY || !env.SONARAEM_EMAIL_FROM) {
		return null;
	}

	return {
		apiKey: env.SONARAEM_RESEND_API_KEY,
		from: env.SONARAEM_EMAIL_FROM,
		replyTo: env.SONARAEM_EMAIL_REPLY_TO,
	};
}

function getDashboardUrl() {
	return (
		env.NEXT_PUBLIC_SONARAEM_DASHBOARD_URL ?? env.NEXT_PUBLIC_SONARAEM_API_URL
	);
}

async function getUserForEmail(userId: string) {
	const [userRow] = await db
		.select({
			id: user.id,
			name: user.name,
			email: user.email,
		})
		.from(user)
		.where(eq(user.id, userId));

	return userRow ?? null;
}

async function getAdminUserForEmail() {
	// DB-enforced at most one 'admin' row (user_single_admin_idx) — this is that one account.
	const [adminRow] = await db
		.select({ email: user.email })
		.from(user)
		.where(eq(user.role, "admin"));

	return adminRow ?? null;
}

export async function sendOrganizeCompleteNotification({
	userId,
	runId,
	playlistsCreated,
	tracksOrganized,
}: {
	userId: string;
	runId: number;
	playlistsCreated: number;
	tracksOrganized: number;
}) {
	const config = buildSendConfig();
	if (!config) {
		logger.warn(
			{ userId, runId },
			"Skipping organize completion email because email provider config is missing",
		);
		return { ok: false, reason: "provider_not_configured" as const };
	}

	const userRow = await getUserForEmail(userId);
	if (!userRow) {
		return { ok: false, reason: "user_not_found" as const };
	}

	const idempotencyKey = `organize-complete/${runId}`;
	const policy = await evaluateEmailPolicy({
		userId,
		email: userRow.email,
		templateKey: "organize_complete",
	});
	if (!policy.allowed || !userRow.email) {
		await reserveEmailDelivery({
			userId,
			email: userRow.email ?? "unknown",
			templateKey: "organize_complete",
			idempotencyKey,
			metadata: { runId, policyReason: policy.reason },
		});
		await markEmailDelivery({
			idempotencyKey,
			status: "skipped",
			skipReason: policy.reason,
		});
		logger.info(
			{
				userId,
				runId,
				templateKey: "organize_complete",
				reason: policy.reason,
			},
			"Email delivery skipped",
		);
		return { ok: false, reason: policy.reason };
	}

	const reservation = await reserveEmailDelivery({
		userId,
		email: userRow.email,
		templateKey: "organize_complete",
		idempotencyKey,
		metadata: { runId, playlistsCreated, tracksOrganized },
	});
	if (!reservation.created) {
		return { ok: true, reason: "already_sent" as const };
	}

	const result = await sendOrganizeCompleteEmail({
		config,
		to: userRow.email,
		idempotencyKey,
		props: {
			dashboardPlaylistsUrl: `${getDashboardUrl()}${DASHBOARD_ROUTES.playlists.path}`,
			recipientName: userRow.name,
			topPlaylists: await getRecentGeneratedPlaylists(userId),
		},
	});

	if (!result.ok) {
		await markEmailDelivery({
			idempotencyKey,
			status: "failed",
			error: result.error,
		});
		logger.warn(
			{
				userId,
				runId,
				templateKey: "organize_complete",
				error: result.error,
			},
			"Email delivery failed",
		);
		return { ok: false, reason: "send_failed" as const, error: result.error };
	}

	await markEmailDelivery({
		idempotencyKey,
		status: "sent",
		providerMessageId: result.emailId,
	});
	logger.info(
		{
			userId,
			runId,
			templateKey: "organize_complete",
			providerMessageId: result.emailId,
		},
		"Email delivery sent",
	);

	return { ok: true, reason: "sent" as const };
}

export async function sendOrganizeWeeklyDigestNotification({
	userId,
	runId,
	createdPlaylists,
	updatedPlaylists,
	tracksOrganized,
}: {
	userId: string;
	runId: number;
	createdPlaylists: CreatedPlaylist[];
	updatedPlaylists: number;
	tracksOrganized: number;
}) {
	const config = buildSendConfig();
	if (!config) {
		logger.warn(
			{ userId, runId },
			"Skipping weekly digest email because email provider config is missing",
		);
		return { ok: false, reason: "provider_not_configured" as const };
	}

	const userRow = await getUserForEmail(userId);
	if (!userRow) {
		return { ok: false, reason: "user_not_found" as const };
	}

	const idempotencyKey = `organize-weekly-digest/${runId}`;
	const policy = await evaluateEmailPolicy({
		userId,
		email: userRow.email,
		templateKey: "organize_weekly_digest",
	});
	if (!policy.allowed || !userRow.email) {
		await reserveEmailDelivery({
			userId,
			email: userRow.email ?? "unknown",
			templateKey: "organize_weekly_digest",
			idempotencyKey,
			metadata: { runId, policyReason: policy.reason },
		});
		await markEmailDelivery({
			idempotencyKey,
			status: "skipped",
			skipReason: policy.reason,
		});
		logger.info(
			{
				userId,
				runId,
				templateKey: "organize_weekly_digest",
				reason: policy.reason,
			},
			"Email delivery skipped",
		);
		return { ok: false, reason: policy.reason };
	}

	const reservation = await reserveEmailDelivery({
		userId,
		email: userRow.email,
		templateKey: "organize_weekly_digest",
		idempotencyKey,
		metadata: {
			runId,
			createdCount: createdPlaylists.length,
			updatedPlaylists,
			tracksOrganized,
		},
	});
	if (!reservation.created) {
		return { ok: true, reason: "already_sent" as const };
	}

	const result = await sendOrganizeWeeklyDigestEmail({
		config,
		to: userRow.email,
		idempotencyKey,
		props: {
			dashboardPlaylistsUrl: `${getDashboardUrl()}${DASHBOARD_ROUTES.playlists.path}`,
			recipientName: userRow.name,
			createdCount: createdPlaylists.length,
			updatedCount: updatedPlaylists,
			tracksOrganized,
			newPlaylistNames: createdPlaylists.map((p) => p.name),
		},
	});

	if (!result.ok) {
		await markEmailDelivery({
			idempotencyKey,
			status: "failed",
			error: result.error,
		});
		logger.warn(
			{
				userId,
				runId,
				templateKey: "organize_weekly_digest",
				error: result.error,
			},
			"Email delivery failed",
		);
		return { ok: false, reason: "send_failed" as const, error: result.error };
	}

	await markEmailDelivery({
		idempotencyKey,
		status: "sent",
		providerMessageId: result.emailId,
	});
	logger.info(
		{
			userId,
			runId,
			templateKey: "organize_weekly_digest",
			providerMessageId: result.emailId,
		},
		"Email delivery sent",
	);

	return { ok: true, reason: "sent" as const };
}

async function getRecentGeneratedPlaylists(userId: string) {
	return db
		.select({
			name: playlist.name,
			trackCount: playlist.trackCount,
		})
		.from(playlist)
		.where(and(eq(playlist.userId, userId), eq(playlist.isGenerated, true)))
		.orderBy(desc(playlist.createdAt))
		.limit(3);
}

export async function sendWelcomeNotification({ userId }: { userId: string }) {
	const config = buildSendConfig();
	if (!config) return { ok: false, reason: "provider_not_configured" as const };

	const userRow = await getUserForEmail(userId);
	if (!userRow?.email) return { ok: false, reason: "missing_email" as const };

	const idempotencyKey = `welcome/${userId}`;
	const policy = await evaluateEmailPolicy({
		userId,
		email: userRow.email,
		templateKey: "welcome",
	});
	if (!policy.allowed) {
		await reserveEmailDelivery({
			userId,
			email: userRow.email,
			templateKey: "welcome",
			idempotencyKey,
			metadata: { policyReason: policy.reason },
		});
		await markEmailDelivery({
			idempotencyKey,
			status: "skipped",
			skipReason: policy.reason,
		});
		logger.info(
			{ userId, templateKey: "welcome", reason: policy.reason },
			"Email delivery skipped",
		);
		return { ok: false, reason: policy.reason };
	}

	const reservation = await reserveEmailDelivery({
		userId,
		email: userRow.email,
		templateKey: "welcome",
		idempotencyKey,
	});
	if (!reservation.created)
		return { ok: true, reason: "already_sent" as const };

	const result = await sendWelcomeEmail({
		config,
		to: userRow.email,
		idempotencyKey,
		props: {
			dashboardUrl: getDashboardUrl(),
			recipientName: userRow.name,
		},
	});

	if (!result.ok) {
		await markEmailDelivery({
			idempotencyKey,
			status: "failed",
			error: result.error,
		});
		logger.warn(
			{ userId, templateKey: "welcome", error: result.error },
			"Email delivery failed",
		);
		return { ok: false, reason: "send_failed" as const, error: result.error };
	}

	await markEmailDelivery({
		idempotencyKey,
		status: "sent",
		providerMessageId: result.emailId,
	});
	logger.info(
		{
			userId,
			templateKey: "welcome",
			providerMessageId: result.emailId,
		},
		"Email delivery sent",
	);
	return { ok: true, reason: "sent" as const };
}

export async function sendSpotifyReauthNotification({
	userId,
	stage,
	refreshTokenExpiresAt,
}: {
	userId: string;
	stage: "14d" | "3d" | "0d";
	/**
	 * Identifies which 6-month token cycle this reminder belongs to. Without
	 * it, the idempotency key repeats verbatim across cycles — a user who
	 * reconnects and lives through a second full cycle would have their
	 * legitimate new reminder silently swallowed as a "duplicate" of the
	 * first cycle's send.
	 */
	refreshTokenExpiresAt: Date;
}) {
	const config = buildSendConfig();
	if (!config) return { ok: false, reason: "provider_not_configured" as const };

	const userRow = await getUserForEmail(userId);
	if (!userRow?.email) return { ok: false, reason: "missing_email" as const };

	// Keyed per stage and per token cycle so 14d/3d/0d each send at most once
	// per cycle, and a later cycle's reminders aren't suppressed by an
	// earlier cycle's delivery record under the same stage name.
	const idempotencyKey = `spotify-reauth/${stage}/${userId}/${refreshTokenExpiresAt.getTime()}`;
	const policy = await evaluateEmailPolicy({
		userId,
		email: userRow.email,
		templateKey: "spotify_reauth",
	});
	if (!policy.allowed) {
		const reservation = await reserveEmailDelivery({
			userId,
			email: userRow.email,
			templateKey: "spotify_reauth",
			idempotencyKey,
			metadata: { stage, policyReason: policy.reason },
		});
		// A prior call for this same idempotencyKey may have already sent
		// successfully — don't downgrade a completed "sent" record back to
		// "skipped" and make it look retryable.
		if (reservation.created) {
			await markEmailDelivery({
				idempotencyKey,
				status: "skipped",
				skipReason: policy.reason,
			});
		}
		logger.info(
			{ userId, templateKey: "spotify_reauth", stage, reason: policy.reason },
			"Email delivery skipped",
		);
		return { ok: false, reason: policy.reason };
	}

	const reservation = await reserveEmailDelivery({
		userId,
		email: userRow.email,
		templateKey: "spotify_reauth",
		idempotencyKey,
		metadata: { stage },
	});
	if (!reservation.created)
		return { ok: true, reason: "already_sent" as const };

	const result = await sendSpotifyReauthEmail({
		config,
		to: userRow.email,
		idempotencyKey,
		props: {
			dashboardUrl: getDashboardUrl(),
			recipientName: userRow.name,
			stage,
		},
	});

	if (!result.ok) {
		await markEmailDelivery({
			idempotencyKey,
			status: "failed",
			error: result.error,
		});
		logger.warn(
			{ userId, templateKey: "spotify_reauth", stage, error: result.error },
			"Email delivery failed",
		);
		return { ok: false, reason: "send_failed" as const, error: result.error };
	}

	await markEmailDelivery({
		idempotencyKey,
		status: "sent",
		providerMessageId: result.emailId,
	});
	logger.info(
		{
			userId,
			templateKey: "spotify_reauth",
			stage,
			providerMessageId: result.emailId,
		},
		"Email delivery sent",
	);
	return { ok: true, reason: "sent" as const };
}

// Feedback is only meaningful once the user has actually experienced the
// product end to end: finished onboarding, seen a manual analysis they
// asked for, and seen an automated (cron) one happen on its own. Checked at
// send time (not schedule time) since a user can cross these thresholds
// during the 3-day wait.
async function isEligibleForFeedback3Day(userId: string): Promise<boolean> {
	const [userRow] = await db
		.select({ hasCompletedOnboarding: user.hasCompletedOnboarding })
		.from(user)
		.where(eq(user.id, userId));
	if (!userRow?.hasCompletedOnboarding) return false;

	const [manualRun] = await db
		.select({ id: pipelineRun.id })
		.from(pipelineRun)
		.where(
			and(
				eq(pipelineRun.userId, userId),
				eq(pipelineRun.triggeredBy, "user"),
				eq(pipelineRun.status, "completed"),
			),
		)
		.limit(1);
	if (!manualRun) return false;

	const [cronRun] = await db
		.select({ id: pipelineRun.id })
		.from(pipelineRun)
		.where(
			and(
				eq(pipelineRun.userId, userId),
				eq(pipelineRun.triggeredBy, "cron"),
				eq(pipelineRun.status, "completed"),
			),
		)
		.limit(1);
	return !!cronRun;
}

export async function sendFeedback3DayNotification({
	userId,
	campaignKey,
}: {
	userId: string;
	campaignKey: string;
}) {
	const config = buildSendConfig();
	if (!config) return { ok: false, reason: "provider_not_configured" as const };

	const userRow = await getUserForEmail(userId);
	if (!userRow?.email) return { ok: false, reason: "missing_email" as const };

	// Deliberately checked before touching the dedup table: this campaign's
	// idempotency key is scoped per-user (not per-run), so reserving it here
	// while not yet eligible would permanently block the real send once the
	// user does become eligible on a later run.
	if (!(await isEligibleForFeedback3Day(userId))) {
		logger.info(
			{ userId, templateKey: "feedback_3day", campaignKey },
			"Feedback 3-day email not yet eligible — onboarding/manual/automated analysis conditions not all met",
		);
		return { ok: false, reason: "not_eligible" as const };
	}

	// Scoped per-user, not per-run: this campaign should fire at most once
	// ever per user, regardless of how many organize runs they complete.
	const idempotencyKey = `feedback-3day/${userId}`;
	const policy = await evaluateEmailPolicy({
		userId,
		email: userRow.email,
		templateKey: "feedback_3day",
	});
	if (!policy.allowed) {
		await reserveEmailDelivery({
			userId,
			email: userRow.email,
			templateKey: "feedback_3day",
			idempotencyKey,
			metadata: { campaignKey, policyReason: policy.reason },
		});
		await markEmailDelivery({
			idempotencyKey,
			status: "skipped",
			skipReason: policy.reason,
		});
		logger.info(
			{
				userId,
				templateKey: "feedback_3day",
				reason: policy.reason,
				campaignKey,
			},
			"Email delivery skipped",
		);
		return { ok: false, reason: policy.reason };
	}

	const reservation = await reserveEmailDelivery({
		userId,
		email: userRow.email,
		templateKey: "feedback_3day",
		idempotencyKey,
		metadata: { campaignKey },
	});
	if (!reservation.created)
		return { ok: true, reason: "already_sent" as const };

	const feedbackParams = new URLSearchParams({
		source: "email_feedback_3day",
		campaignKey,
	});
	const result = await sendFeedback3DayEmail({
		config,
		to: userRow.email,
		idempotencyKey,
		props: {
			recipientName: userRow.name,
			feedbackUrl: `${getDashboardUrl()}${DASHBOARD_ROUTES.feedback.path}?${feedbackParams.toString()}`,
			settingsUrl: `${getDashboardUrl()}${DASHBOARD_ROUTES.settings.children.notifications.path}`,
			dashboardUrl: getDashboardUrl(),
		},
	});

	if (!result.ok) {
		await markEmailDelivery({
			idempotencyKey,
			status: "failed",
			error: result.error,
		});
		logger.warn(
			{
				userId,
				templateKey: "feedback_3day",
				campaignKey,
				error: result.error,
			},
			"Email delivery failed",
		);
		return { ok: false, reason: "send_failed" as const, error: result.error };
	}

	await markEmailDelivery({
		idempotencyKey,
		status: "sent",
		providerMessageId: result.emailId,
	});
	logger.info(
		{
			userId,
			templateKey: "feedback_3day",
			campaignKey,
			providerMessageId: result.emailId,
		},
		"Email delivery sent",
	);
	return { ok: true, reason: "sent" as const };
}

// Ops alert to the single admin account, not a user-facing template — no
// per-recipient notification policy or delivery dedupe: every automation
// failure should page the admin, including repeats.
export async function sendAllowlistAutomationFailedNotification({
	targetEmail,
	action,
	errorMessage,
}: {
	targetEmail: string;
	action: "add" | "remove";
	errorMessage: string;
}) {
	const config = buildSendConfig();
	if (!config) {
		logger.warn(
			{ targetEmail, action },
			"Skipping Spotify allowlist failure alert — email provider is not configured",
		);
		return { ok: false, reason: "provider_not_configured" as const };
	}

	const admin = await getAdminUserForEmail();
	if (!admin?.email) {
		logger.warn(
			{ targetEmail, action },
			"Skipping Spotify allowlist failure alert — no admin account found",
		);
		return { ok: false, reason: "no_admin_account" as const };
	}

	const result = await sendSpotifyAllowlistFailedEmail({
		config,
		to: admin.email,
		idempotencyKey: `spotify-allowlist-failed/${randomUUID()}`,
		props: {
			triggerRunsUrl: "https://cloud.trigger.dev",
			targetEmail,
			action,
			errorMessage,
		},
	});

	if (!result.ok) {
		logger.warn(
			{ targetEmail, action, error: result.error },
			"Spotify allowlist failure alert failed to send",
		);
		return { ok: false, reason: "send_failed" as const, error: result.error };
	}

	logger.info(
		{ targetEmail, action, providerMessageId: result.emailId },
		"Spotify allowlist failure alert sent",
	);
	return { ok: true, reason: "sent" as const };
}
