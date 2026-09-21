import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@sonaraem/logger", () => ({
	logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));
vi.mock("@sonaraem/env/server", () => ({
	env: { SONARAEM_SPOTIFY_CLIENT_ID: "test-client-id" },
}));
vi.mock("@trigger.dev/sdk", () => ({
	queue: (opts: unknown) => opts,
	task: (opts: unknown) => opts,
	schedules: { task: (opts: unknown) => opts },
	wait: { for: vi.fn() },
}));
vi.mock("../../../../services/spotify-allowlist/dashboard-automation", () => ({
	addAllowlistUser: vi.fn(),
	removeAllowlistUser: vi.fn(),
	scrapeAllowlistEmails: vi.fn(),
}));
vi.mock("../../emails/send-allowlist-automation-failed", () => ({
	sendAllowlistAutomationFailedEmailTask: { trigger: vi.fn() },
}));

const music = vi.hoisted(() => ({
	exportPlaylistToSpotify: vi.fn(),
	syncLibraryTracks: vi.fn(),
}));
vi.mock("../../../../services/music", () => music);

const allowlist = vi.hoisted(() => ({
	getLastAllowlistWriteAt: vi.fn(),
	hasMutationBudget: vi.fn(),
	loadAllowlistSession: vi.fn(),
	recordAllowlistCheckResult: vi.fn(),
	recordAllowlistWriteNow: vi.fn(),
	recordMutation: vi.fn(),
	saveAllowlistSession: vi.fn(),
	getNextConsolidatedBatch: vi.fn(),
	getRotationEntryByUserId: vi.fn(),
	markJobsDone: vi.fn(),
	markJobsFailed: vi.fn(),
	markRotationEntryOffList: vi.fn(),
	markRotationEntryOnList: vi.fn(),
	markRotationEntryServiced: vi.fn(),
	requeueForBudget: vi.fn(),
	runAllowlistMutation: vi.fn(),
}));
vi.mock("../../../../services/spotify-allowlist", () => allowlist);

import { AllowlistBudgetExhaustedError } from "../manage-allowlist-entry";
import { dispatchNextRotationBatch } from "../rotation-dispatcher";

const BATCH = {
	userId: "user-1",
	jobs: [{ id: 1, jobType: "snapshot_refresh" as const, playlistIds: null }],
};
const ON_LIST_ENTRY = {
	id: 10,
	email: "friend@example.com",
	status: "on_list" as const,
	refreshIntervalDays: 30,
	lastServicedAt: null,
};
const OFF_LIST_ENTRY = { ...ON_LIST_ENTRY, status: "off_list" as const };

describe("rotationDispatcherTask", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("requeues without penalty when the add hits the budget wall, real AllowlistBudgetExhaustedError", async () => {
		allowlist.getNextConsolidatedBatch.mockResolvedValueOnce(BATCH);
		allowlist.getRotationEntryByUserId.mockResolvedValueOnce(OFF_LIST_ENTRY);
		allowlist.runAllowlistMutation.mockRejectedValueOnce(
			new AllowlistBudgetExhaustedError("add"),
		);

		const result = await dispatchNextRotationBatch();

		expect(result).toEqual({ dispatched: false, waitingOnBudget: true });
		expect(allowlist.requeueForBudget).toHaveBeenCalledWith([1]);
		expect(allowlist.markJobsFailed).not.toHaveBeenCalled();
		expect(allowlist.markRotationEntryOffList).toHaveBeenCalledWith(10);
	});

	it("marks the batch failed (not requeued) for a real automation error", async () => {
		allowlist.getNextConsolidatedBatch.mockResolvedValueOnce(BATCH);
		allowlist.getRotationEntryByUserId.mockResolvedValueOnce(OFF_LIST_ENTRY);
		allowlist.runAllowlistMutation.mockRejectedValueOnce(
			new Error("dashboard DOM changed"),
		);

		const result = await dispatchNextRotationBatch();

		expect(result).toEqual({
			dispatched: false,
			error: "dashboard DOM changed",
		});
		expect(allowlist.markJobsFailed).toHaveBeenCalledWith(
			[1],
			"dashboard DOM changed",
		);
		expect(allowlist.requeueForBudget).not.toHaveBeenCalled();
	});

	it("reserves the seat (marks on_list) before the real add, and rolls back on failure", async () => {
		allowlist.getNextConsolidatedBatch.mockResolvedValueOnce(BATCH);
		allowlist.getRotationEntryByUserId.mockResolvedValueOnce(OFF_LIST_ENTRY);
		const callOrder: string[] = [];
		allowlist.markRotationEntryOnList.mockImplementationOnce(async () => {
			callOrder.push("markRotationEntryOnList");
		});
		allowlist.runAllowlistMutation.mockImplementationOnce(async () => {
			callOrder.push("runAllowlistMutation");
			throw new Error("spotify down");
		});
		allowlist.markRotationEntryOffList.mockImplementationOnce(async () => {
			callOrder.push("markRotationEntryOffList");
		});

		await dispatchNextRotationBatch();

		expect(callOrder).toEqual([
			"markRotationEntryOnList",
			"runAllowlistMutation",
			"markRotationEntryOffList",
		]);
	});

	it("skips the add entirely when the entry is already on_list", async () => {
		allowlist.getNextConsolidatedBatch.mockResolvedValueOnce(BATCH);
		allowlist.getRotationEntryByUserId.mockResolvedValueOnce(ON_LIST_ENTRY);

		await dispatchNextRotationBatch();

		expect(allowlist.markRotationEntryOnList).not.toHaveBeenCalled();
		expect(allowlist.runAllowlistMutation).toHaveBeenCalledWith(
			"friend@example.com",
			"remove",
		);
	});
});
