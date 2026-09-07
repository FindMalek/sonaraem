import { clearSpotifyNeedsReauth } from "@sonaraem/common/services/music";
import type { AllowlistIdentity } from "@sonaraem/common/services/spotify-allowlist";
import {
	acquireLoginSlot,
	releaseLoginSlot,
} from "@sonaraem/common/services/spotify-allowlist";
import {
	getWaitlistInviteIdentity,
	tryAutoApproveByEmail,
} from "@sonaraem/common/services/waitlist";
import { sendWelcomeEmailTask } from "@sonaraem/common/trigger/tasks/emails/send-welcome";
import { buildTrustedOrigins } from "@sonaraem/common/utils/origin";
import * as schema from "@sonaraem/db/schema/auth";
import { logger } from "@sonaraem/logger";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import {
	APIError,
	createAuthMiddleware,
	getSessionFromCtx,
} from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins";

// Short-lived — only needs to survive the Spotify OAuth round trip.
const LOGIN_SLOT_COOKIE = "sonaraem_login_slot";
const LOGIN_SLOT_COOKIE_MAX_AGE_SECONDS = 5 * 60;

// Minimal shape releaseLoginSlotIfHeld needs — databaseHooks' `after` context isn't exported as a standalone type.
type CookieContext = {
	getCookie: (name: string) => string | null;
	setCookie: (
		name: string,
		value: string,
		attributes?: Record<string, unknown>,
	) => void;
} | null;

export type AuthVariant = "dashboard" | "admin";

/**
 * Environment config required for auth initialization
 */
export type AuthEnvConfig = {
	SONARAEM_BETTER_AUTH_SECRET: string;
	NEXT_PUBLIC_SONARAEM_API_URL: string;
	NEXT_PUBLIC_SONARAEM_DASHBOARD_URL?: string;
	NEXT_PUBLIC_SONARAEM_ADMIN_URL?: string;
	NEXT_PUBLIC_SONARAEM_ALLOWED_ORIGIN?: string;
	SONARAEM_SPOTIFY_CLIENT_ID?: string;
	SONARAEM_SPOTIFY_CLIENT_SECRET?: string;
	VERCEL?: boolean;
	VERCEL_BRANCH_URL?: string;
	VERCEL_PROJECT_PRODUCTION_URL?: string;
};

function buildCrossSubDomainCookies(envConfig: AuthEnvConfig) {
	if (!envConfig.VERCEL) {
		return undefined;
	}
	try {
		const hostname = new URL(envConfig.NEXT_PUBLIC_SONARAEM_API_URL).hostname;
		const parts = hostname.split(".");
		if (parts.length < 2) {
			return undefined;
		}
		const domain = parts.slice(-2).join(".");
		return { enabled: true as const, domain };
	} catch {
		return undefined;
	}
}

function buildAuthAdvanced(envConfig: AuthEnvConfig, variant: AuthVariant) {
	const crossSubDomainCookies = buildCrossSubDomainCookies(envConfig);
	return {
		cookiePrefix:
			variant === "dashboard" ? "sonaraem-dashboard" : "sonaraem-admin",
		...(crossSubDomainCookies ? { crossSubDomainCookies } : {}),
	};
}

function buildTrustedOriginsList(envConfig: AuthEnvConfig) {
	const originConfig = [
		envConfig.NEXT_PUBLIC_SONARAEM_API_URL,
		envConfig.NEXT_PUBLIC_SONARAEM_DASHBOARD_URL,
		envConfig.NEXT_PUBLIC_SONARAEM_ADMIN_URL,
		envConfig.VERCEL_BRANCH_URL,
		envConfig.VERCEL_PROJECT_PRODUCTION_URL,
	].filter((origin): origin is string => origin !== undefined);

	return buildTrustedOrigins(
		originConfig,
		!!envConfig.VERCEL,
		envConfig.NEXT_PUBLIC_SONARAEM_ALLOWED_ORIGIN,
	);
}

/**
 * Runs on every Spotify account link/re-link (first sign-in and every
 * return visit) — covers the case where someone was approved but never
 * clicked their invite email, only signed in directly. Note: Spotify's
 * profile email is self-reported, not independently verified — see the
 * security note on tryAutoApproveByEmail for why this is still an accepted
 * tradeoff here.
 */
async function autoApproveIfWaitlisted(accountUserId: string): Promise<void> {
	try {
		await tryAutoApproveByEmail(accountUserId);
	} catch (err) {
		logger.warn(
			{
				userId: accountUserId,
				error: err instanceof Error ? err.message : String(err),
			},
			"Failed to auto-approve from waitlist on Spotify sign-in",
		);
	}
}

/**
 * Fires on every Spotify account link/re-link — a fresh token just landed,
 * so clear any stale "needs reauth" state (#289).
 */
async function clearReauthFlagIfNeeded(accountUserId: string): Promise<void> {
	try {
		await clearSpotifyNeedsReauth(accountUserId);
	} catch (err) {
		logger.warn(
			{
				userId: accountUserId,
				error: err instanceof Error ? err.message : String(err),
			},
			"Failed to clear Spotify reauth flag after account link",
		);
	}
}

// Identifies who's signing in (invite cookie for a first-timer, session for a reconnect) and which email to gate.
async function resolveLoginIdentity(
	// Parameters<> instead of importing GenericEndpointContext — not exported as a standalone name from better-auth/api.
	ctx: Parameters<typeof getSessionFromCtx>[0],
): Promise<{ identity: AllowlistIdentity; email: string } | null> {
	const inviteToken = ctx.getCookie("sonaraem_invite");
	if (inviteToken) {
		const invite = await getWaitlistInviteIdentity(inviteToken);
		if (invite) {
			return {
				identity: { waitlistSignupId: invite.waitlistSignupId },
				email: invite.spotifyEmail,
			};
		}
	}

	const session = await getSessionFromCtx(ctx);
	if (session?.user?.email) {
		return {
			identity: { userId: session.user.id },
			email: session.user.email,
		};
	}

	return null;
}

// Releases the slot the before-hook acquired (via its cookie) now that sign-in has completed; clears the cookie either way.
async function releaseLoginSlotIfHeld(context: CookieContext): Promise<void> {
	if (!context) return;
	const slotIdRaw = context.getCookie(LOGIN_SLOT_COOKIE);
	if (!slotIdRaw) return;

	const slotId = Number(slotIdRaw);
	try {
		if (Number.isFinite(slotId)) {
			await releaseLoginSlot(slotId);
		}
	} catch (err) {
		logger.error(
			{ slotId, error: err instanceof Error ? err.message : String(err) },
			"Failed to release the Spotify allowlist login slot after sign-in",
		);
	} finally {
		context.setCookie(LOGIN_SLOT_COOKIE, "", { maxAge: 0, path: "/" });
	}
}

const sharedUserFields = {
	additionalFields: {
		hasCompletedOnboarding: {
			type: "boolean" as const,
			required: false,
			defaultValue: false,
			input: false,
		},
		isApproved: {
			type: "boolean" as const,
			required: false,
			defaultValue: false,
			input: false,
		},
	},
};

/**
 * Dashboard auth: Spotify OAuth + dashboard session cookie.
 */
export function createDashboardAuth(
	database: Parameters<typeof drizzleAdapter>[0],
	envConfig: AuthEnvConfig,
) {
	const spotifyClientId = envConfig.SONARAEM_SPOTIFY_CLIENT_ID;
	const spotifyClientSecret = envConfig.SONARAEM_SPOTIFY_CLIENT_SECRET;
	const spotifyEnabled = !!spotifyClientId && !!spotifyClientSecret;

	return betterAuth({
		baseURL: envConfig.NEXT_PUBLIC_SONARAEM_API_URL,
		basePath: "/api/auth",
		secret: envConfig.SONARAEM_BETTER_AUTH_SECRET,
		advanced: buildAuthAdvanced(envConfig, "dashboard"),
		database: drizzleAdapter(database, {
			provider: "pg",
			schema,
		}),
		databaseHooks: {
			user: {
				create: {
					after: async (createdUser) => {
						try {
							await sendWelcomeEmailTask.trigger({ userId: createdUser.id });
						} catch (err) {
							logger.warn(
								{
									userId: createdUser.id,
									error: err instanceof Error ? err.message : String(err),
								},
								"Failed to send welcome email",
							);
						}
					},
				},
			},
			account: {
				create: {
					// Fires on first-ever Spotify link and on re-auth after Better Auth
					// re-links an existing provider account — either way, a fresh token
					// just landed: clear any stale "needs reauth" state (#289) and
					// check whether this account's email matches an approved,
					// unredeemed waitlist entry (#298).
					after: async (createdAccount, context) => {
						if (createdAccount.providerId !== "spotify") return;
						await Promise.all([
							clearReauthFlagIfNeeded(createdAccount.userId),
							autoApproveIfWaitlisted(createdAccount.userId),
							releaseLoginSlotIfHeld(context),
						]);
					},
				},
				update: {
					after: async (updatedAccount, context) => {
						if (updatedAccount.providerId !== "spotify") return;
						await Promise.all([
							clearReauthFlagIfNeeded(updatedAccount.userId),
							autoApproveIfWaitlisted(updatedAccount.userId),
							releaseLoginSlotIfHeld(context),
						]);
					},
				},
			},
		},
		hooks: {
			// A single middleware run on every request (unlike a plugin's hooks) — checks the path itself.
			before: createAuthMiddleware(async (ctx) => {
				if (
					ctx.path !== "/sign-in/social" ||
					ctx.body?.provider !== "spotify"
				) {
					return;
				}

				const resolved = await resolveLoginIdentity(ctx);
				// No resolvable identity — nothing to gate, Spotify's own check runs as today.
				if (!resolved) return;

				try {
					const { slotId } = await acquireLoginSlot(
						resolved.identity,
						resolved.email,
					);
					ctx.setCookie(LOGIN_SLOT_COOKIE, String(slotId), {
						httpOnly: true,
						secure: !!envConfig.VERCEL,
						sameSite: "lax",
						maxAge: LOGIN_SLOT_COOKIE_MAX_AGE_SECONDS,
						path: "/",
					});
				} catch (err) {
					logger.error(
						{
							email: resolved.email,
							error: err instanceof Error ? err.message : String(err),
						},
						"Failed to acquire a Spotify allowlist login slot",
					);
					throw new APIError("SERVICE_UNAVAILABLE", {
						message:
							"We couldn't prepare your Spotify connection — please try again in a moment.",
					});
				}
			}),
		},
		user: sharedUserFields,
		trustedOrigins: buildTrustedOriginsList(envConfig),
		emailAndPassword: {
			enabled: true,
		},
		socialProviders:
			spotifyEnabled && spotifyClientId && spotifyClientSecret
				? {
						spotify: {
							clientId: spotifyClientId,
							clientSecret: spotifyClientSecret,
							redirectURI: `${envConfig.NEXT_PUBLIC_SONARAEM_API_URL}/api/auth/callback/spotify`,
							scope: [
								"user-read-email",
								"user-read-private",
								"user-library-read",
								"playlist-read-private",
								"playlist-read-collaborative",
								"playlist-modify-private",
								"playlist-modify-public",
							],
						},
					}
				: {},
		// nextCookies must be last — it flushes the cookie jar into real Set-Cookie headers, so anything after it silently loses its cookie writes.
		plugins: [admin({ defaultRole: "user" }), nextCookies()],
	});
}

/**
 * Admin auth: email/password only + separate session cookie.
 */
export function createAdminAuth(
	database: Parameters<typeof drizzleAdapter>[0],
	envConfig: AuthEnvConfig,
) {
	return betterAuth({
		baseURL: envConfig.NEXT_PUBLIC_SONARAEM_API_URL,
		basePath: "/api/admin-auth",
		secret: envConfig.SONARAEM_BETTER_AUTH_SECRET,
		advanced: buildAuthAdvanced(envConfig, "admin"),
		database: drizzleAdapter(database, {
			provider: "pg",
			schema,
		}),
		user: sharedUserFields,
		trustedOrigins: buildTrustedOriginsList(envConfig),
		emailAndPassword: {
			enabled: true,
			// Closed for good — the one admin account is created via admin.setup.create instead.
			disableSignUp: true,
		},
		socialProviders: {},
		// nextCookies must be last — it flushes the cookie jar into real Set-Cookie headers, so anything after it silently loses its cookie writes.
		plugins: [admin({ defaultRole: "user" }), nextCookies()],
	});
}

/** @deprecated Use createDashboardAuth — kept for backwards compatibility */
export function createAuth(
	database: Parameters<typeof drizzleAdapter>[0],
	envConfig: AuthEnvConfig,
) {
	return createDashboardAuth(database, envConfig);
}

export type DashboardAuth = ReturnType<typeof createDashboardAuth>;
export type AdminAuth = ReturnType<typeof createAdminAuth>;
export type Auth = DashboardAuth;

export let dashboardAuth: DashboardAuth;
export let adminAuth: AdminAuth;

/** Alias for dashboardAuth */
export let auth: Auth;

export function initializeAuth(
	database: Parameters<typeof createDashboardAuth>[0],
	envConfig: AuthEnvConfig,
): void {
	dashboardAuth = createDashboardAuth(database, envConfig);
	adminAuth = createAdminAuth(database, envConfig);
	auth = dashboardAuth;
}
