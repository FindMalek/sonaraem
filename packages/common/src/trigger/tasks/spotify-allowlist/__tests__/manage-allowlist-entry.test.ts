import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@sonaraem/env/server", () => ({
	env: { SONARAEM_SPOTIFY_CLIENT_ID: "test-client-id" },
}));
vi.mock("@sonaraem/logger", () => ({
	logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));
vi.mock("@trigger.dev/sdk", () => ({
	queue: (opts: unknown) => opts,
	task: (opts: unknown) => opts,
	wait: { for: vi.fn() },
}));

const allowlist = vi.hoisted(() => ({
	getLastAllowlistWriteAt: vi.fn(),
	hasMutationBudget: vi.fn(),
	loadAllowlistSession: vi.fn(),
	recordAllowlistCheckResult: vi.fn(),
	recordAllowlistWriteNow: vi.fn(),
	recordMutation: vi.fn(),
	saveAllowlistSession: vi.fn(),
}));
vi.mock("../../../../services/spotify-allowlist", () => allowlist);

const dashboard = vi.hoisted(() => ({
	addAllowlistUser: vi.fn(),
	removeAllowlistUser: vi.fn(),
	scrapeAllowlistEmails: vi.fn(),
}));
vi.mock(
	"../../../../services/spotify-allowlist/dashboard-automation",
	() => dashboard,
);

vi.mock("../../emails/send-allowlist-automation-failed", () => ({
	sendAllowlistAutomationFailedEmailTask: { trigger: vi.fn() },
}));

const fakePage = {
	goto: vi.fn(async () => {}),
	locator: vi.fn(() => ({ waitFor: vi.fn(async () => {}) })),
};
const fakeContext = {
	newPage: vi.fn(async () => fakePage),
	storageState: vi.fn(async () => ({})),
};
const fakeBrowser = {
	newContext: vi.fn(async () => fakeContext),
	close: vi.fn(async () => {}),
};
vi.mock("playwright", () => ({
	chromium: { launch: vi.fn(async () => fakeBrowser) },
}));

import {
	AllowlistBudgetExhaustedError,
	isBudgetExhaustedMessage,
	manageAllowlistEntry,
} from "../manage-allowlist-entry";

describe("isBudgetExhaustedMessage", () => {
	it("matches the exact message AllowlistBudgetExhaustedError produces", () => {
		const err = new AllowlistBudgetExhaustedError("add");
		expect(isBudgetExhaustedMessage(err.message)).toBe(true);
	});

	it("matches for the remove direction too", () => {
		const err = new AllowlistBudgetExhaustedError("remove");
		expect(isBudgetExhaustedMessage(err.message)).toBe(true);
	});

	it("does not match an unrelated error message", () => {
		expect(
			isBudgetExhaustedMessage("Re-scrape didn't confirm the mutation"),
		).toBe(false);
	});
});

describe("manageAllowlistEntryTask ordering (#409)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		allowlist.loadAllowlistSession.mockResolvedValue("{}");
		allowlist.getLastAllowlistWriteAt.mockResolvedValue(null);
		allowlist.hasMutationBudget.mockResolvedValue(true);
		dashboard.scrapeAllowlistEmails
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce(["friend@example.com"]);
	});

	it("records the mutation before performing the real Spotify add, not after", async () => {
		const callOrder: string[] = [];
		allowlist.recordMutation.mockImplementationOnce(async () => {
			callOrder.push("recordMutation");
		});
		dashboard.addAllowlistUser.mockImplementationOnce(async () => {
			callOrder.push("addAllowlistUser");
		});

		const result = await manageAllowlistEntry({
			email: "friend@example.com",
			action: "add",
		});

		expect(result).toEqual({ confirmed: true });
		expect(callOrder).toEqual(["recordMutation", "addAllowlistUser"]);
	});
});
