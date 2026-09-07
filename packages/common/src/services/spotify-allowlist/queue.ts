import { db } from "@sonaraem/db";
import { userSpotifyLibraryStats } from "@sonaraem/db/schema/spotify";
import {
	spotifyAllowlistQueueRequest,
	spotifyAllowlistSlot,
} from "@sonaraem/db/schema/spotify-allowlist";
import { logger } from "@sonaraem/logger";
import {
	and,
	asc,
	eq,
	inArray,
	isNull,
	lt,
	notInArray,
	or,
	sql,
} from "drizzle-orm";

import { DEFAULT_OCCUPIED_TIMEOUT_MS } from "../../constants/spotify-allowlist";

// Each queue-request row is one acquisition episode (waiting -> active -> done/failed) — sync and export get separate ones, sequenced.
const CRON_STALE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

const LIVE_QUEUE_STATUSES = ["waiting", "active"] as const;

export type AllowlistPriority = "login" | "manual" | "cron";
export type AllowlistSlotKind = "rotation" | "login";

export type AllowlistIdentity =
	| { userId: string; waitlistSignupId?: undefined }
	| { userId?: undefined; waitlistSignupId: number };

export type EnqueueResult = {
	requestId: number;
	alreadyQueued: boolean;
};

// login gets its own single-slot pool (never contends with background sync/export); manual and cron share the rest.
function poolForPriority(priority: AllowlistPriority): AllowlistSlotKind {
	return priority === "login" ? "login" : "rotation";
}

function isUniqueConstraintConflict(err: unknown, constraint: string): boolean {
	if (typeof err !== "object" || err === null) return false;
	if (!("code" in err) || !("constraint" in err)) return false;
	return err.code === "23505" && err.constraint === constraint;
}

// Idempotent per identity — returns the existing live request instead of erroring on a conflict.
export async function enqueue(
	identity: AllowlistIdentity,
	priority: AllowlistPriority,
): Promise<EnqueueResult> {
	const constraint =
		identity.userId !== undefined
			? "spotify_allowlist_queue_request_one_live_per_user"
			: "spotify_allowlist_queue_request_one_live_per_waitlist_signup";

	try {
		const [inserted] = await db
			.insert(spotifyAllowlistQueueRequest)
			.values({
				userId: identity.userId ?? null,
				waitlistSignupId: identity.waitlistSignupId ?? null,
				priority,
			})
			.returning({ id: spotifyAllowlistQueueRequest.id });

		if (!inserted) throw new Error("Failed to create allowlist queue request");
		return { requestId: inserted.id, alreadyQueued: false };
	} catch (err) {
		if (!isUniqueConstraintConflict(err, constraint)) throw err;

		const identityFilter =
			identity.userId !== undefined
				? eq(spotifyAllowlistQueueRequest.userId, identity.userId)
				: eq(
						spotifyAllowlistQueueRequest.waitlistSignupId,
						identity.waitlistSignupId,
					);

		const [existing] = await db
			.select({ id: spotifyAllowlistQueueRequest.id })
			.from(spotifyAllowlistQueueRequest)
			.where(
				and(
					identityFilter,
					inArray(spotifyAllowlistQueueRequest.status, LIVE_QUEUE_STATUSES),
				),
			);

		if (!existing) {
			// Lost race with a request that completed/failed before we could look it up.
			throw new Error(
				"Allowlist queue insert conflicted but no live request was found",
			);
		}
		return { requestId: existing.id, alreadyQueued: true };
	}
}

export type AcquireSlotResult =
	| { acquired: true; slotId: number }
	| { acquired: false; reason: "not-your-turn" | "no-slot-available" };

// Only succeeds if this request is both front-of-its-pool and a slot in that
// pool is free — that single check is the whole priority guarantee. login
// and rotation (manual/cron) are separate pools with separate slots, so a
// login never queues behind background sync/export work.
export async function tryAcquireSlot(
	requestId: number,
	email: string,
): Promise<AcquireSlotResult> {
	return await db.transaction(async (tx) => {
		// Locked so two concurrent callers for the same request can't both
		// read "waiting" and each win a different slot for it — the second
		// blocks here until the first commits, then re-reads as "active" (or
		// whatever it became) and correctly refuses.
		const [request] = await tx
			.select({
				id: spotifyAllowlistQueueRequest.id,
				userId: spotifyAllowlistQueueRequest.userId,
				status: spotifyAllowlistQueueRequest.status,
				priority: spotifyAllowlistQueueRequest.priority,
			})
			.from(spotifyAllowlistQueueRequest)
			.where(eq(spotifyAllowlistQueueRequest.id, requestId))
			.for("update");

		if (request?.status !== "waiting") {
			return { acquired: false, reason: "not-your-turn" as const };
		}

		const pool = poolForPriority(request.priority);
		const poolFilter =
			pool === "login"
				? eq(spotifyAllowlistQueueRequest.priority, "login")
				: inArray(spotifyAllowlistQueueRequest.priority, ["manual", "cron"]);

		const [front] = await tx
			.select({ id: spotifyAllowlistQueueRequest.id })
			.from(spotifyAllowlistQueueRequest)
			.where(
				and(eq(spotifyAllowlistQueueRequest.status, "waiting"), poolFilter),
			)
			.orderBy(
				sql`(${spotifyAllowlistQueueRequest.priority} = 'manual') desc`,
				asc(spotifyAllowlistQueueRequest.requestedAt),
			)
			.limit(1);

		if (front?.id !== requestId) {
			return { acquired: false, reason: "not-your-turn" as const };
		}

		const [slot] = await tx
			.select({ id: spotifyAllowlistSlot.id })
			.from(spotifyAllowlistSlot)
			.where(
				and(
					eq(spotifyAllowlistSlot.status, "available"),
					eq(spotifyAllowlistSlot.kind, pool),
				),
			)
			.orderBy(asc(spotifyAllowlistSlot.id))
			.limit(1)
			.for("update", { skipLocked: true });

		if (!slot) {
			return { acquired: false, reason: "no-slot-available" as const };
		}

		await tx
			.update(spotifyAllowlistSlot)
			.set({
				status: "occupied",
				userId: request.userId,
				email,
				occupiedAt: new Date(),
			})
			.where(eq(spotifyAllowlistSlot.id, slot.id));

		await tx
			.update(spotifyAllowlistQueueRequest)
			.set({
				status: "active",
				slotId: slot.id,
				email,
				activatedAt: new Date(),
			})
			.where(eq(spotifyAllowlistQueueRequest.id, requestId));

		return { acquired: true, slotId: slot.id };
	});
}

export type RequestOutcome = "done" | "failed" | "cancelled";

// Goes straight back to available — the caller only calls this after the
// real removal from the dashboard is already confirmed (or the slot never
// actually landed on the dashboard at all), so there's no stray state left
// behind to protect against. Anti-detection spacing is enforced globally in
// manageAllowlistEntryTask, not by holding capacity idle here.
export async function releaseSlot(
	slotId: number,
	opts: { outcome?: RequestOutcome; error?: string } = {},
): Promise<void> {
	const { outcome = "done", error } = opts;
	const now = new Date();

	await db.transaction(async (tx) => {
		await tx
			.update(spotifyAllowlistSlot)
			.set({
				status: "available",
				userId: null,
				email: null,
				releasedAt: now,
			})
			.where(eq(spotifyAllowlistSlot.id, slotId));

		await tx
			.update(spotifyAllowlistQueueRequest)
			.set({ status: outcome, completedAt: now, error: error ?? null })
			.where(
				and(
					eq(spotifyAllowlistQueueRequest.slotId, slotId),
					eq(spotifyAllowlistQueueRequest.status, "active"),
				),
			);
	});
}

// For a request that never acquired a slot (still `waiting`) — a timeout or a
// cancellation detected while polling. There's no slot to touch.
export async function settleWaitingRequest(
	requestId: number,
	outcome: "failed" | "cancelled",
	error?: string,
): Promise<void> {
	await db
		.update(spotifyAllowlistQueueRequest)
		.set({ status: outcome, completedAt: new Date(), error: error ?? null })
		.where(
			and(
				eq(spotifyAllowlistQueueRequest.id, requestId),
				eq(spotifyAllowlistQueueRequest.status, "waiting"),
			),
		);
}

// For a request whose slot's real dashboard state is UNKNOWN — a remove call
// itself failed, so the email may still be on the real Spotify account.
// Deliberately does NOT touch the slot: it's left `occupied` so the existing
// crash-timeout sweep (timeoutReclaim, bounded by DEFAULT_OCCUPIED_TIMEOUT_MS)
// picks it up and retries the real removal, rather than handing the slot to a
// new acquirer while the dashboard might still list this email.
export async function failActiveRequestForSlot(
	slotId: number,
	error: string,
): Promise<void> {
	await db
		.update(spotifyAllowlistQueueRequest)
		.set({ status: "failed", completedAt: new Date(), error })
		.where(
			and(
				eq(spotifyAllowlistQueueRequest.slotId, slotId),
				eq(spotifyAllowlistQueueRequest.status, "active"),
			),
		);
}

export type ReclaimedSlot = { slotId: number; email: string | null };

// Sweeps slots stuck `occupied` past a timeout (worker crashed) — moves them
// to `reclaiming` and fails the owning request. A single guarded UPDATE (not
// a select-then-update loop) so concurrent sweeps can't double-reclaim the
// same slot. Returns the email each reclaimed slot was occupying — the
// caller still owes that email a real removal from the Spotify dashboard,
// since a crashed worker means it was added but never removed. The slot
// stays `reclaiming` (unusable) until confirmReclaimed() is called after
// that removal actually lands — never on a timer, since a stray dashboard
// entry left in place would otherwise let a new occupant push the real
// account past its 5-user cap.
export async function timeoutReclaim(
	timeoutMs: number = DEFAULT_OCCUPIED_TIMEOUT_MS,
): Promise<ReclaimedSlot[]> {
	const cutoff = new Date(Date.now() - timeoutMs);
	const now = new Date();

	const reclaimed = await db.transaction(async (tx) => {
		const updated = await tx
			.update(spotifyAllowlistSlot)
			.set({
				status: "reclaiming",
				userId: null,
				releasedAt: now,
			})
			.where(
				and(
					eq(spotifyAllowlistSlot.status, "occupied"),
					lt(spotifyAllowlistSlot.occupiedAt, cutoff),
				),
			)
			.returning({
				id: spotifyAllowlistSlot.id,
				email: spotifyAllowlistSlot.email,
			});

		for (const { id: slotId } of updated) {
			await tx
				.update(spotifyAllowlistQueueRequest)
				.set({
					status: "failed",
					completedAt: now,
					error: "Slot held past timeout — worker likely crashed mid-run",
				})
				.where(
					and(
						eq(spotifyAllowlistQueueRequest.slotId, slotId),
						eq(spotifyAllowlistQueueRequest.status, "active"),
					),
				);
		}

		return updated;
	});

	if (reclaimed.length === 0) return [];

	logger.warn(
		{ slotIds: reclaimed.map((s) => s.id), timeoutMs },
		"Force-reclaimed Spotify allowlist slots stuck past their occupied timeout",
	);

	return reclaimed.map((s) => ({ slotId: s.id, email: s.email }));
}

// Only call after the stray dashboard entry from a crash-reclaimed slot has
// actually been confirmed removed — see timeoutReclaim(). Guarded by the
// `reclaiming` status so it's a no-op if the slot already moved on somehow.
export async function confirmReclaimed(slotId: number): Promise<void> {
	await db
		.update(spotifyAllowlistSlot)
		.set({ status: "available", email: null })
		.where(
			and(
				eq(spotifyAllowlistSlot.id, slotId),
				eq(spotifyAllowlistSlot.status, "reclaiming"),
			),
		);
}

// Stale or never-synced, not needing reauth, not already queued.
export async function nextEligibleForCron(
	batchSize: number,
): Promise<string[]> {
	const staleCutoff = new Date(Date.now() - CRON_STALE_WINDOW_MS);

	const liveUserIds = db
		.select({ userId: spotifyAllowlistQueueRequest.userId })
		.from(spotifyAllowlistQueueRequest)
		.where(
			and(
				inArray(spotifyAllowlistQueueRequest.status, LIVE_QUEUE_STATUSES),
				sql`${spotifyAllowlistQueueRequest.userId} is not null`,
			),
		);

	const rows = await db
		.select({ userId: userSpotifyLibraryStats.userId })
		.from(userSpotifyLibraryStats)
		.where(
			and(
				or(
					isNull(userSpotifyLibraryStats.lastFullSyncAt),
					lt(userSpotifyLibraryStats.lastFullSyncAt, staleCutoff),
				),
				eq(userSpotifyLibraryStats.needsReauth, false),
				notInArray(userSpotifyLibraryStats.userId, liveUserIds),
			),
		)
		.limit(batchSize);

	return rows.map((r) => r.userId);
}

/** True if a higher-priority (login or manual) request is waiting right now — lets a long-running cron stage voluntarily yield. */
export async function yieldCheck(): Promise<boolean> {
	const [waiting] = await db
		.select({ id: spotifyAllowlistQueueRequest.id })
		.from(spotifyAllowlistQueueRequest)
		.where(
			and(
				eq(spotifyAllowlistQueueRequest.status, "waiting"),
				inArray(spotifyAllowlistQueueRequest.priority, ["login", "manual"]),
			),
		)
		.limit(1);

	return !!waiting;
}
