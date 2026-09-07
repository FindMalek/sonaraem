import type { BuildExtension } from "@trigger.dev/build";
import { defineConfig } from "@trigger.dev/sdk";

const PLAYWRIGHT_VERSION = "1.62.1";
const CHROMIUM_APT_PACKAGES = [
	"libasound2",
	"libatk-bridge2.0-0",
	"libatk1.0-0",
	"libatspi2.0-0",
	"libcairo2",
	"libcups2",
	"libdbus-1-3",
	"libdrm2",
	"libgbm1",
	"libglib2.0-0",
	"libnspr4",
	"libnss3",
	"libpango-1.0-0",
	"libx11-6",
	"libxcb1",
	"libxcomposite1",
	"libxdamage1",
	"libxext6",
	"libxfixes3",
	"libxkbcommon0",
	"libxrandr2",
];

// Replaces @trigger.dev/build's own playwright() extension, which greps `playwright install
// --dry-run` output for "browser: <name>" — real output looks like "(playwright chromium vNNN)",
// so the grep never matches and every deploy fails. This installs chromium directly instead.
function playwrightChromium(): BuildExtension {
	return {
		name: "PlaywrightChromium",
		// External in dev too (unlike the official extension) — local node_modules already has a
		// real playwright install, so esbuild should let Node require it at runtime, not bundle it.
		externalsForTarget: () => ["playwright"],
		onBuildComplete(context) {
			if (context.target === "dev") return;
			context.addLayer({
				id: "playwright-chromium",
				image: {
					instructions: [
						`RUN apt-get update && apt-get install -y --no-install-recommends ${CHROMIUM_APT_PACKAGES.join(" ")} && apt-get clean && rm -rf /var/lib/apt/lists/*`,
						`RUN npx --yes playwright@${PLAYWRIGHT_VERSION} install chromium`,
					],
				},
				dependencies: { playwright: PLAYWRIGHT_VERSION },
			});
		},
	};
}

export default defineConfig({
	// process.env, not apiEnv — apiEnv validates the entire api schema eagerly, which `trigger deploy` in CI doesn't have.
	project:
		process.env.SONARAEM_TRIGGER_PROJECT_REF ??
		process.env.TRIGGER_PROJECT_REF ??
		"",
	runtime: "node-24",
	dirs: ["./src/trigger"],
	maxDuration: 1800,
	retries: {
		enabledInDev: false,
		default: {
			maxAttempts: 1,
		},
	},
	build: {
		extensions: [playwrightChromium()],
	},
});
