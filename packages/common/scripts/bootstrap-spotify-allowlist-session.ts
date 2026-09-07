import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const { chromium } = await import("playwright");
const { saveAllowlistSession } = await import(
	"../src/services/spotify-allowlist/session"
);

// Run by hand — opens a visible browser so a human can log in (OTP included), then saves the resulting session.
async function main() {
	console.info("Opening a browser — log into the automation account by hand.");
	console.info(
		"Once you're on the Dashboard (past any OTP prompt), press Enter here.",
	);

	const browser = await chromium.launch({ headless: false });
	const context = await browser.newContext();
	const page = await context.newPage();
	await page.goto("https://developer.spotify.com/dashboard");

	await new Promise<void>((resolve) => {
		process.stdin.once("data", () => resolve());
	});

	const state = await context.storageState();
	await saveAllowlistSession(JSON.stringify(state));
	await browser.close();

	console.info("Session saved.");
	process.exit(0);
}

await main().catch((err) => {
	console.error(err);
	process.exit(1);
});
