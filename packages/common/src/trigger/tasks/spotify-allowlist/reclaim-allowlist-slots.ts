import { logger } from "@sonaraem/logger";
import { schedules } from "@trigger.dev/sdk";

import { LOGIN_OCCUPIED_TIMEOUT_MS } from "../../../constants/spotify-allowlist";
import {
	confirmReclaimed,
	timeoutReclaim,
} from "../../../services/spotify-allowlist";
import { sendAllowlistAutomationFailedEmailTask } from "../emails/send-allowlist-automation-failed";
import { manageAllowlistEntryTask } from "./manage-allowlist-entry";

// A slot force-reclaimed by timeoutReclaim means its worker crashed between
// adding the email and removing it - the DB is freed for cleanup purposes,
// but stays `reclaiming` (unusable by a new acquirer) and the real dashboard
// still has the stray entry. Only a confirmed removal here frees the slot
// for reuse — on failure it's left stuck on purpose (see timeoutReclaim's
// doc comment) and an admin is alerted to fix it by hand.
async function removeStrandedEntry(email: string): Promise<boolean> {
	try {
		await manageAllowlistEntryTask
			.triggerAndWait({ email, action: "remove" })
			.unwrap();
		return true;
	} catch (err) {
		logger.error(
			{ email, err },
			"Failed to remove a stranded Spotify allowlist entry during reclaim",
		);
		await sendAllowlistAutomationFailedEmailTask
			.trigger({
				targetEmail: email,
				action: "remove",
				errorMessage: err instanceof Error ? err.message : String(err),
			})
			.catch((alertErr) => {
				logger.error(
					{ alertErr },
					"Failed to enqueue Spotify allowlist failure alert during reclaim",
				);
			});
		return false;
	}
}

export const reclaimAllowlistSlotsTask = schedules.task({
	id: "spotify-allowlist-reclaim-slots",
	cron: "*/5 * * * *",
	run: async () => {
		// login only ever holds one slot for the span of one interactive
		// sign-in — a stuck one blocks every other login behind it, so it
		// gets a much shorter timeout than the background rotation pool.
		const [rotationStuck, loginStuck] = await Promise.all([
			timeoutReclaim(undefined, "rotation"),
			timeoutReclaim(LOGIN_OCCUPIED_TIMEOUT_MS, "login"),
		]);
		const stuck = [...rotationStuck, ...loginStuck];
		let recovered = 0;
		for (const { slotId, email } of stuck) {
			const removed = !email || (await removeStrandedEntry(email));
			if (removed) {
				await confirmReclaimed(slotId);
				recovered++;
			}
		}

		const summary = { stuckReclaimed: stuck.length, recovered };
		logger.info(summary, "Completed Spotify allowlist slot reclaim sweep");
		return summary;
	},
});
