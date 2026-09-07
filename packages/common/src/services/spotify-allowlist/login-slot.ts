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

// No Trigger.dev task context here (unlike withAllowlistSlot), so this polls with setTimeout and runs.poll() instead of wait.for()/triggerAndWait().
const POLL_INTERVAL_MS = 500;

export class LoginSlotError extends Error {}

export type AcquiredLoginSlot = {
	requestId: number;
	slotId: number;
	email: string;
};

// runs.poll() has no deadline of its own (up to its internal 500-attempt cap) — race it against our own bound instead.
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

// Acquires the reserved `login` slot, adds `email` for real, and returns what releaseLoginSlot() needs later; throws LoginSlotError on any failure.
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
		// Never confirmed on the real dashboard — give the slot straight back.
		await releaseSlot(slotId, { outcome: "failed", error: message });
		throw new LoginSlotError(
			`Failed to add ${email} to the Spotify allowlist: ${message}`,
		);
	}

	return { requestId, slotId, email };
}

// Releases a slot from acquireLoginSlot() — looks the email up from the slot row rather than the caller carrying it around.
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
		// Login already succeeded — leave the slot occupied for the crash-timeout sweep instead of failing the user.
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
