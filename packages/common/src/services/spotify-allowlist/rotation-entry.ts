import { db } from "@sonaraem/db";
import { spotifyAllowlistEntry } from "@sonaraem/db/schema/spotify-allowlist";
import { and, eq, lte } from "drizzle-orm";

export type RotationEntry = {
	id: number;
	email: string;
	status: "on_list" | "off_list";
	refreshIntervalDays: number;
};

export async function getRotationEntryByUserId(
	userId: string,
): Promise<RotationEntry | null> {
	const [row] = await db
		.select({
			id: spotifyAllowlistEntry.id,
			email: spotifyAllowlistEntry.email,
			status: spotifyAllowlistEntry.status,
			refreshIntervalDays: spotifyAllowlistEntry.refreshIntervalDays,
		})
		.from(spotifyAllowlistEntry)
		.where(eq(spotifyAllowlistEntry.userId, userId))
		.limit(1);
	return row ?? null;
}

export async function markRotationEntryOnList(id: number): Promise<void> {
	await db
		.update(spotifyAllowlistEntry)
		.set({ status: "on_list" })
		.where(eq(spotifyAllowlistEntry.id, id));
}

/**
 * Call once all queued work for this user's session is actually done —
 * resets the due-date clock regardless of which job type triggered the
 * visit (docs/decisions/0001's consolidation rule: any successful touch
 * counts, so this user isn't re-added for a second reason shortly after).
 */
export async function markRotationEntryServiced(
	id: number,
	refreshIntervalDays: number,
): Promise<void> {
	const now = new Date();
	const nextDueAt = new Date(
		now.getTime() + refreshIntervalDays * 24 * 60 * 60 * 1000,
	);
	await db
		.update(spotifyAllowlistEntry)
		.set({ status: "off_list", lastServicedAt: now, nextDueAt })
		.where(eq(spotifyAllowlistEntry.id, id));
}

/** Dormant (off-list) users whose scheduled refresh is due — feeds the daily due-date scanner. */
export async function findDueForRefresh(
	limit = 50,
): Promise<Array<{ userId: string | null }>> {
	return db
		.select({ userId: spotifyAllowlistEntry.userId })
		.from(spotifyAllowlistEntry)
		.where(
			and(
				eq(spotifyAllowlistEntry.status, "off_list"),
				lte(spotifyAllowlistEntry.nextDueAt, new Date()),
			),
		)
		.limit(limit);
}
