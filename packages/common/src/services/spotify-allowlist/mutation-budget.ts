import { db } from "@sonaraem/db";
import { spotifyAllowlistMutationLog } from "@sonaraem/db/schema/spotify-allowlist";
import { and, eq, gte, sql } from "drizzle-orm";

const ROLLING_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Spotify's observed ceiling is ~5 ADDs and ~5 REMOVEs per rolling 24h,
 * app-wide (#390) — undocumented, boundary timing unknown. We budget 4 of
 * each, keeping 1 as margin, per docs/decisions/0001-spotify-allowlist-rotation.md.
 * REMOVE is assumed to share the same shape as ADD as a deliberate
 * conservative choice — only ADD is empirically confirmed throttled.
 */
export const SAFE_MUTATION_BUDGET_PER_DIRECTION = 4;

export type MutationDirection = "add" | "remove";

/**
 * Count of confirmed mutations in the trailing `windowMs` — a true sliding
 * window (recomputed against "now" on every call), not a fixed calendar
 * bucket, since Spotify's own window boundaries aren't documented.
 */
export async function countMutationsInWindow(
	direction: MutationDirection,
	windowMs: number = ROLLING_WINDOW_MS,
): Promise<number> {
	const since = new Date(Date.now() - windowMs);
	const [row] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(spotifyAllowlistMutationLog)
		.where(
			and(
				eq(spotifyAllowlistMutationLog.direction, direction),
				gte(spotifyAllowlistMutationLog.occurredAt, since),
			),
		);
	return row?.count ?? 0;
}

export async function hasMutationBudget(
	direction: MutationDirection,
	limit: number = SAFE_MUTATION_BUDGET_PER_DIRECTION,
): Promise<boolean> {
	const used = await countMutationsInWindow(direction);
	return used < limit;
}

/** Call only after a mutation is confirmed to have actually landed — never speculatively. */
export async function recordMutation(
	direction: MutationDirection,
	email: string,
): Promise<void> {
	await db
		.insert(spotifyAllowlistMutationLog)
		.values({ direction, email: email.toLowerCase() });
}

export type MutationBudgetStatus = {
	add: { used: number; limit: number; remaining: number };
	remove: { used: number; limit: number; remaining: number };
};

/** For the admin dashboard and the admission/dispatch schedulers to check headroom before queuing more work. */
export async function getMutationBudgetStatus(
	limit: number = SAFE_MUTATION_BUDGET_PER_DIRECTION,
): Promise<MutationBudgetStatus> {
	const [addUsed, removeUsed] = await Promise.all([
		countMutationsInWindow("add"),
		countMutationsInWindow("remove"),
	]);
	return {
		add: { used: addUsed, limit, remaining: Math.max(0, limit - addUsed) },
		remove: {
			used: removeUsed,
			limit,
			remaining: Math.max(0, limit - removeUsed),
		},
	};
}
