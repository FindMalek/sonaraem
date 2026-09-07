import { db } from "@sonaraem/db";
import { spotifyAllowlistSlot } from "@sonaraem/db/schema/spotify-allowlist";
import { env } from "@sonaraem/env/server";
import { logger } from "@sonaraem/logger";
import { schedules } from "@trigger.dev/sdk";
import { eq } from "drizzle-orm";
import { chromium } from "playwright";

import {
	confirmReclaimed,
	loadAllowlistSession,
	recordAllowlistWriteNow,
	saveAllowlistSession,
	timeoutReclaim,
} from "../../../services/spotify-allowlist";
import {
	removeAllowlistUser,
	scrapeAllowlistEmails,
} from "../../../services/spotify-allowlist/dashboard-automation";
import { sendAllowlistAutomationFailedEmailTask } from "../emails/send-allowlist-automation-failed";
import {
	AllowlistAutomationError,
	allowlistAutomationQueue,
	manageAllowlistEntryTask,
	USERS_URL,
	waitForWriteGap,
} from "./manage-allowlist-entry";

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

async function reconcileWithDashboard(): Promise<{
	scraped: number;
	pruned: string[];
}> {
	const sessionState = await loadAllowlistSession();
	if (!sessionState) {
		logger.warn(
			"Skipping Spotify allowlist reconcile sweep — no saved session",
		);
		return { scraped: 0, pruned: [] };
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

		const scrapedEmails = await scrapeAllowlistEmails(page);

		const occupiedRows = await db
			.select({ email: spotifyAllowlistSlot.email })
			.from(spotifyAllowlistSlot)
			.where(eq(spotifyAllowlistSlot.status, "occupied"));
		const expected = new Set(
			[
				env.SONARAEM_SPOTIFY_ALLOWLIST_ADMIN_EMAIL,
				...occupiedRows.map((row) => row.email),
			]
				.filter((email): email is string => !!email)
				.map((email) => email.toLowerCase()),
		);

		const stray = scrapedEmails.filter((email) => !expected.has(email));

		const pruned: string[] = [];
		for (const email of stray) {
			await waitForWriteGap();
			await removeAllowlistUser(page, email);
			await recordAllowlistWriteNow();
			pruned.push(email);
			logger.warn(
				{ email },
				"Removed an unaccounted-for entry from the Spotify allowlist during reconcile",
			);
		}

		const refreshedState = await context.storageState();
		await saveAllowlistSession(JSON.stringify(refreshedState));

		return { scraped: scrapedEmails.length, pruned };
	} catch (err) {
		logger.error(
			{ error: err instanceof Error ? err.message : String(err) },
			"Spotify allowlist reconcile sweep failed",
		);
		return { scraped: 0, pruned: [] };
	} finally {
		await browser?.close();
	}
}

export const reclaimAllowlistSlotsTask = schedules.task({
	id: "spotify-allowlist-reclaim-slots",
	cron: "*/5 * * * *",
	queue: allowlistAutomationQueue,
	run: async () => {
		const stuck = await timeoutReclaim();
		let recovered = 0;
		for (const { slotId, email } of stuck) {
			const removed = !email || (await removeStrandedEntry(email));
			if (removed) {
				await confirmReclaimed(slotId);
				recovered++;
			}
		}

		const { scraped, pruned } = await reconcileWithDashboard();

		const summary = {
			stuckReclaimed: stuck.length,
			recovered,
			dashboardScraped: scraped,
			dashboardPruned: pruned,
		};
		logger.info(summary, "Completed Spotify allowlist slot reclaim sweep");
		return summary;
	},
});
