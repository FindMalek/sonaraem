import { logger } from "@sonaraem/logger";
import { task } from "@trigger.dev/sdk";
import { chromium } from "playwright";

// TEMPORARY spike for #290 — delete once we know whether Playwright can reach this page from Trigger.dev.
const DASHBOARD_LOGIN_URL = "https://developer.spotify.com/dashboard";
const CHALLENGE_TEXT_MARKERS = [
	"checking your browser",
	"verify you are human",
	"attention required",
];

export const spikeDashboardReachTask = task({
	id: "spotify-allowlist-spike-dashboard-reach",
	retry: { maxAttempts: 1 },
	run: async () => {
		const browser = await chromium.launch({ headless: true });
		try {
			const context = await browser.newContext();
			const page = await context.newPage();

			const response = await page
				.goto(DASHBOARD_LOGIN_URL, { waitUntil: "domcontentloaded" })
				.catch(() => null);

			const cookies = await context.cookies();
			const challengeCookiesPresent = cookies
				.map((c) => c.name)
				.filter(
					(name) => name.startsWith("cf_chl_") || name === "cf_clearance",
				);

			const bodyText = (await page.textContent("body").catch(() => "")) ?? "";
			const challengeTextMatched = CHALLENGE_TEXT_MARKERS.filter((marker) =>
				bodyText.toLowerCase().includes(marker),
			);

			const captchaIframeDetected =
				(await page
					.locator(
						'iframe[src*="challenges.cloudflare.com"], iframe[title*="captcha" i]',
					)
					.count()
					.catch(() => 0)) > 0;

			const emailInput = page
				.locator('input[type="email"], input[name*="email" i]')
				.first();
			const loginFormReached = await emailInput
				.waitFor({ state: "visible", timeout: 5000 })
				.then(() => true)
				.catch(() => false);

			const screenshotBuffer = await page
				.screenshot({ type: "jpeg", quality: 40 })
				.catch(() => null);

			const result = {
				finalUrl: page.url(),
				httpStatus: response?.status() ?? null,
				challengeCookiesPresent,
				challengeTextMatched,
				captchaIframeDetected,
				loginFormReached,
				screenshotBase64: screenshotBuffer?.toString("base64") ?? null,
			};

			logger.info(
				{ ...result, screenshotBase64: undefined },
				"Spotify allowlist dashboard-reach spike result",
			);
			return result;
		} finally {
			await browser.close();
		}
	},
});
