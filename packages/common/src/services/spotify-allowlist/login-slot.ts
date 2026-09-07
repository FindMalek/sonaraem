import { db } from "@sonaraem/db";
import { spotifyAllowlistSlot } from "@sonaraem/db/schema/spotify-allowlist";
import { logger } from "@sonaraem/logger";
import { runs } from "@trigger.dev/sdk";
import { eq } from "drizzle-orm";

import {
	LOGIN_SLOT_ACQUIRE_TIMEOUT_MS,
	LOGIN_SLOT_AUTOMATION_TIMEOUT_MS,
} from "../../constants/spotify-allowlist";
import { manageAllowlistEntryTask } from "../../trigger/tasks/spotify-allowlist/manage-allowlist-entry";
import {
	type AllowlistIdentity,
	enqueue,
	failActiveRequestForSlot,
	releaseSlot,
	tryAcquireSlot,
} from "./queue";

// Acquiring a login slot and running the add automation happens
// synchronously inside the OAuth sign-in request — there's no Trigger.dev
// task context here (unlike withAllowlistSlot, which runs inside one), so
// this polls with plain setTimeout and waits on the triggered run with
// runs.poll() rather than wait.for()/triggerAndWait(), neither of which
// work outside a task run.
const POLL_INTERVAL_MS = 500;

export class LoginSlotError extends Error {}

export type AcquiredLoginSlot = {
	requestId: number;
	slotId: number;
	email: string;
};

// runs.poll() has no deadline of its own — left alone it'll happily poll for
// minutes (up to its internal 500-attempt cap). Race it against our own
// bound instead, since this all has to fit inside one HTTP request.
async function waitForRun(handle: { id: string }, timeoutMs: number) {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(
			() => reject(new Error(`Run ${handle.id} did not complete in time`)),
			timeoutMs,
		);
	});
	try {
		return await Promise.race([
			runs.poll(handle.id, { pollIntervalMs: 500 }),
			timeout,
		]);
	} finally {
		clearTimeout(timer);
	}
}

// Acquires the reserved `login` slot for `identity`, adds `email` to the
// real Spotify allowlist, and returns what releaseLoginSlot() needs later.
// Throws LoginSlotError on any failure — the caller should let that abort
// the sign-in request rather than send someone to Spotify while they're not
// actually allowlisted yet.
export async function acquireLoginSlot(
	identity: AllowlistIdentity,
	email: string,
): Promise<AcquiredLoginSlot> {
	const { requestId } = await enqueue(identity, "login");

	const deadline = Date.now() + LOGIN_SLOT_ACQUIRE_TIMEOUT_MS;
	let slotId: number | null = null;
	while (Date.now() < deadline) {
		const result = await tryAcquireSlot(requestId, email);
		if (result.acquired) {
			slotId = result.slotId;
			break;
		}
		await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
	}

	if (slotId === null) {
		throw new LoginSlotError("Timed out waiting for a free login slot");
	}

	try {
		const handle = await manageAllowlistEntryTask.trigger({
			email,
			action: "add",
		});
		const run = await waitForRun(handle, LOGIN_SLOT_AUTOMATION_TIMEOUT_MS);
		if (!run.isSuccess) {
			throw new Error(
				run.error?.message ?? `Allowlist add run ${run.status.toLowerCase()}`,
			);
		}
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		// Never actually landed on the real dashboard (or we're not sure it
		// did) — give the slot straight back rather than holding it occupied.
		await releaseSlot(slotId, { outcome: "failed", error: message });
		throw new LoginSlotError(
			`Failed to add ${email} to the Spotify allowlist: ${message}`,
		);
	}

	return { requestId, slotId, email };
}

// Releases a slot acquired via acquireLoginSlot() — call once the sign-in
// actually completes. Looks the email up from the slot row itself rather
// than requiring the caller to carry it across the OAuth round trip.
export async function releaseLoginSlot(slotId: number): Promise<void> {
	const [slot] = await db
		.select({ email: spotifyAllowlistSlot.email })
		.from(spotifyAllowlistSlot)
		.where(eq(spotifyAllowlistSlot.id, slotId));

	if (!slot?.email) {
		logger.warn(
			{ slotId },
			"releaseLoginSlot: slot has no email on record, releasing without a remove",
		);
		await releaseSlot(slotId);
		return;
	}

	try {
		const handle = await manageAllowlistEntryTask.trigger({
			email: slot.email,
			action: "remove",
		});
		const run = await waitForRun(handle, LOGIN_SLOT_AUTOMATION_TIMEOUT_MS);
		if (!run.isSuccess) {
			throw new Error(
				run.error?.message ??
					`Allowlist remove run ${run.status.toLowerCase()}`,
			);
		}
		await releaseSlot(slotId);
	} catch (err) {
		// The stage itself (the login) already succeeded — don't let a
		// cleanup failure matter to the user. The dashboard may still list
		// this email, so leave the slot occupied for the crash-timeout sweep
		// to reclaim and retry, rather than releasing capacity that isn't
		// actually free yet.
		logger.error(
			{ slotId, err },
			"Failed to remove Spotify allowlist entry after login completed — leaving the slot occupied for reclaim",
		);
		await failActiveRequestForSlot(
			slotId,
			err instanceof Error ? err.message : String(err),
		);
	}
}
