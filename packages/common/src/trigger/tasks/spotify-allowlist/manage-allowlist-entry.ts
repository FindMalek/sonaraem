import { env } from "@sonaraem/env/server";
import { logger } from "@sonaraem/logger";
import { queue, task, wait } from "@trigger.dev/sdk";
import { chromium } from "playwright";

import { DEFAULT_ALLOWLIST_WRITE_GAP_MS } from "../../../constants/spotify-allowlist";
import {
	getLastAllowlistWriteAt,
	loadAllowlistSession,
	recordAllowlistWriteNow,
	saveAllowlistSession,
} from "../../../services/spotify-allowlist";
import {
	addAllowlistUser,
	removeAllowlistUser,
	scrapeAllowlistEmails,
} from "../../../services/spotify-allowlist/dashboard-automation";
import { sendAllowlistAutomationFailedEmailTask } from "../emails/send-allowlist-automation-failed";

const USERS_URL = () =>
	`https://developer.spotify.com/dashboard/${env.SONARAEM_SPOTIFY_CLIENT_ID}/users`;

// No login automation yet (needs Spotify's login/OTP DOM) — a session must already exist.
export class AllowlistAutomationError extends Error {}

// There is exactly one Playwright session for the one automation account —
// concurrency: 1 is required correctness, not just tidiness. Two browsers
// sharing the same storageState would race on the session save and could
// look like two simultaneous logins to Spotify.
const allowlistAutomationQueue = queue({
	name: "spotify-allowlist-manage-entry",
	concurrencyLimit: 1,
});

// Blocks until at least DEFAULT_ALLOWLIST_WRITE_GAP_MS has passed since the
// last confirmed dashboard mutation — the whole anti-detection guarantee now
// that automation is serialized above. Slots themselves free up instantly on
// release; this is the only throttle.
async function waitForWriteGap(): Promise<void> {
	const lastWriteAt = await getLastAllowlistWriteAt();
	if (!lastWriteAt) return;

	const elapsedMs = Date.now() - lastWriteAt.getTime();
	const remainingMs = DEFAULT_ALLOWLIST_WRITE_GAP_MS - elapsedMs;
	if (remainingMs <= 0) return;

	await wait.for({ seconds: Math.ceil(remainingMs / 1000) });
}

// Fire-and-forget: an alerting failure must never mask the automation
// failure that triggered it.
async function alertAdmin(
	targetEmail: string,
	action: "add" | "remove",
	err: unknown,
) {
	try {
		await sendAllowlistAutomationFailedEmailTask.trigger({
			targetEmail,
			action,
			errorMessage: err instanceof Error ? err.message : String(err),
		});
	} catch (alertErr) {
		logger.error(
			{ alertErr },
			"Failed to enqueue Spotify allowlist failure alert",
		);
	}
}

export const manageAllowlistEntryTask = task({
	id: "spotify-allowlist-manage-entry",
	queue: allowlistAutomationQueue,
	retry: { maxAttempts: 1 },
	run: async ({
		email,
		action,
	}: {
		email: string;
		action: "add" | "remove";
	}) => {
		const sessionState = await loadAllowlistSession();
		if (!sessionState) {
			const missingSessionErr = new AllowlistAutomationError(
				"No saved Spotify allowlist session - log in manually once to seed one (login automation isn't built yet)",
			);
			await alertAdmin(email, action, missingSessionErr);
			throw missingSessionErr;
		}

		let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
		try {
			browser = await chromium.launch({ headless: true });
			const context = await browser.newContext({
				storageState: JSON.parse(sessionState),
			});
			const page = await context.newPage();

			await page.goto(USERS_URL(), { waitUntil: "domcontentloaded" });
			const reachedTable = await page
				.locator('table[data-encore-id="table"]')
				.waitFor({ state: "visible", timeout: 15_000 })
				.then(() => true)
				.catch(() => false);

			if (!reachedTable) {
				throw new AllowlistAutomationError(
					"Saved session didn't reach the Users table — it's likely expired (login automation isn't built yet)",
				);
			}

			const existingEmails = await scrapeAllowlistEmails(page);
			const alreadyPresent = existingEmails.includes(email.toLowerCase());
			// A retry after a confirmation glitch shouldn't redo an already-landed mutation.
			const alreadyDone = action === "add" ? alreadyPresent : !alreadyPresent;

			let emails = existingEmails;
			if (!alreadyDone) {
				await waitForWriteGap();
				if (action === "add") {
					await addAllowlistUser(page, email);
				} else {
					await removeAllowlistUser(page, email);
				}
				await recordAllowlistWriteNow();
				emails = await scrapeAllowlistEmails(page);
			}

			const present = emails.includes(email.toLowerCase());
			const confirmed = action === "add" ? present : !present;

			if (!confirmed) {
				logger.error(
					{ email, action, scrapedEmailCount: emails.length },
					"Allowlist re-scrape did not confirm the mutation",
				);
				throw new AllowlistAutomationError(
					`Re-scrape didn't confirm "${action}" for ${email} — the dashboard's DOM may have changed`,
				);
			}

			const refreshedState = await context.storageState();
			await saveAllowlistSession(JSON.stringify(refreshedState));

			return { confirmed: true };
		} catch (err) {
			logger.error(
				{
					email,
					action,
					error: err instanceof Error ? err.message : String(err),
				},
				"Spotify allowlist automation failed",
			);
			await alertAdmin(email, action, err);
			throw err;
		} finally {
			await browser?.close();
		}
	},
});
