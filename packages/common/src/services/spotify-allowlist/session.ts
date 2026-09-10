import { db } from "@sonaraem/db";
import { spotifyAllowlistSession } from "@sonaraem/db/schema/spotify-allowlist";
import { eq } from "drizzle-orm";

import { decryptSessionState, encryptSessionState } from "./crypto";

const SESSION_ROW_ID = 1;

export async function saveAllowlistSession(state: string): Promise<void> {
	const { ciphertext, iv, authTag } = encryptSessionState(state);

	await db
		.insert(spotifyAllowlistSession)
		.values({ id: SESSION_ROW_ID, ciphertext, iv, authTag })
		.onConflictDoUpdate({
			target: spotifyAllowlistSession.id,
			set: { ciphertext, iv, authTag },
		});
}

export async function loadAllowlistSession(): Promise<string | null> {
	const [row] = await db
		.select()
		.from(spotifyAllowlistSession)
		.where(eq(spotifyAllowlistSession.id, SESSION_ROW_ID));

	if (!row) return null;

	try {
		return decryptSessionState(row);
	} catch {
		return null;
	}
}

export async function clearAllowlistSession(): Promise<void> {
	await db
		.delete(spotifyAllowlistSession)
		.where(eq(spotifyAllowlistSession.id, SESSION_ROW_ID));
}

// Global throttle state — the last time a real add/remove mutation landed on
// the dashboard. Same singleton row as the session itself; not encrypted,
// it's just a timestamp.
export async function getLastAllowlistWriteAt(): Promise<Date | null> {
	const [row] = await db
		.select({ lastWriteAt: spotifyAllowlistSession.lastWriteAt })
		.from(spotifyAllowlistSession)
		.where(eq(spotifyAllowlistSession.id, SESSION_ROW_ID));

	return row?.lastWriteAt ?? null;
}

export async function recordAllowlistWriteNow(): Promise<void> {
	await db
		.update(spotifyAllowlistSession)
		.set({ lastWriteAt: new Date() })
		.where(eq(spotifyAllowlistSession.id, SESSION_ROW_ID));
}

// Called after every real automation attempt (add/remove or a standalone health check) — pass null on success, or the error message on failure. Lets the admin dashboard show "is this actually working" without ever needing to launch Playwright itself.
export async function recordAllowlistCheckResult(
	error: string | null,
): Promise<void> {
	await db
		.update(spotifyAllowlistSession)
		.set({ lastCheckedAt: new Date(), lastError: error })
		.where(eq(spotifyAllowlistSession.id, SESSION_ROW_ID));
}

export type AllowlistSessionHealth = {
	hasSession: boolean;
	lastWriteAt: Date | null;
	lastCheckedAt: Date | null;
	lastError: string | null;
};

export async function getAllowlistSessionHealth(): Promise<AllowlistSessionHealth> {
	const [row] = await db
		.select({
			lastWriteAt: spotifyAllowlistSession.lastWriteAt,
			lastCheckedAt: spotifyAllowlistSession.lastCheckedAt,
			lastError: spotifyAllowlistSession.lastError,
		})
		.from(spotifyAllowlistSession)
		.where(eq(spotifyAllowlistSession.id, SESSION_ROW_ID));

	if (!row) {
		return {
			hasSession: false,
			lastWriteAt: null,
			lastCheckedAt: null,
			lastError: null,
		};
	}

	return { hasSession: true, ...row };
}
