import { afterEach, describe, expect, it, vi } from "vitest";

const { dbMock, resultsQueue, queueMock, runsMock, manageAllowlistEntryMock } =
	vi.hoisted(() => {
		const resultsQueue: unknown[] = [];
		function chain(): Record<string, unknown> {
			const obj: Record<string, unknown> = {};
			for (const m of ["from", "where"]) obj[m] = () => obj;
			// biome-ignore lint/suspicious/noThenProperty: intentionally thenable so `await db.select()...` resolves to the queued mock result
			obj.then = (
				resolve: (v: unknown) => unknown,
				reject?: (e: unknown) => unknown,
			) => Promise.resolve(resultsQueue.shift() ?? []).then(resolve, reject);
			return obj;
		}
		return {
			dbMock: { select: () => chain() },
			resultsQueue,
			queueMock: {
				enqueue: vi.fn(),
				tryAcquireSlot: vi.fn(),
				releaseSlot: vi.fn().mockResolvedValue(undefined),
				failActiveRequestForSlot: vi.fn().mockResolvedValue(undefined),
				settleWaitingRequest: vi.fn().mockResolvedValue(undefined),
			},
			runsMock: { poll: vi.fn() },
			manageAllowlistEntryMock: { trigger: vi.fn() },
		};
	});

vi.mock("@sonaraem/db", () => ({ db: dbMock }));
vi.mock("@sonaraem/logger", () => ({
	logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));
vi.mock("@trigger.dev/sdk", () => ({ runs: runsMock }));
vi.mock("../queue", () => queueMock);
vi.mock(
	"../../../trigger/tasks/spotify-allowlist/manage-allowlist-entry",
	() => ({
		manageAllowlistEntryTask: manageAllowlistEntryMock,
	}),
);

import {
	acquireLoginSlot,
	LoginSlotError,
	releaseLoginSlot,
} from "../login-slot";

function push(...values: unknown[]) {
	resultsQueue.push(...values);
}

function successRun(status = "COMPLETED") {
	return {
		id: "run_1",
		status,
		isSuccess: true,
		isFailed: false,
		isCancelled: false,
	};
}

function failedRun(message: string) {
	return {
		id: "run_1",
		status: "FAILED",
		isSuccess: false,
		isFailed: true,
		isCancelled: false,
		error: { message },
	};
}

describe("acquireLoginSlot", () => {
	afterEach(() => {
		resultsQueue.length = 0;
		vi.clearAllMocks();
	});

	it("acquires a slot, adds the email, and returns the slot info", async () => {
		queueMock.enqueue.mockResolvedValue({ requestId: 1, alreadyQueued: false });
		queueMock.tryAcquireSlot.mockResolvedValue({ acquired: true, slotId: 9 });
		manageAllowlistEntryMock.trigger.mockResolvedValue({ id: "run_1" });
		runsMock.poll.mockResolvedValue(successRun());

		const result = await acquireLoginSlot({ userId: "u1" }, "u1@example.com");

		expect(result).toEqual({
			requestId: 1,
			slotId: 9,
			email: "u1@example.com",
		});
		expect(queueMock.enqueue).toHaveBeenCalledWith({ userId: "u1" }, "login");
		expect(manageAllowlistEntryMock.trigger).toHaveBeenCalledWith({
			email: "u1@example.com",
			action: "add",
		});
		expect(queueMock.releaseSlot).not.toHaveBeenCalled();
	});

	it("releases the slot and throws LoginSlotError when the add run fails", async () => {
		queueMock.enqueue.mockResolvedValue({ requestId: 1, alreadyQueued: false });
		queueMock.tryAcquireSlot.mockResolvedValue({ acquired: true, slotId: 4 });
		manageAllowlistEntryMock.trigger.mockResolvedValue({ id: "run_1" });
		runsMock.poll.mockResolvedValue(failedRun("dashboard rejected the add"));

		await expect(
			acquireLoginSlot({ userId: "u2" }, "u2@example.com"),
		).rejects.toThrow(LoginSlotError);

		expect(queueMock.releaseSlot).toHaveBeenCalledWith(4, {
			outcome: "failed",
			error: "dashboard rejected the add",
		});
	});

	it("throws LoginSlotError when no slot frees up before the deadline", async () => {
		queueMock.enqueue.mockResolvedValue({ requestId: 1, alreadyQueued: false });
		queueMock.tryAcquireSlot.mockResolvedValue({
			acquired: false,
			reason: "no-slot-available",
		});

		const base = Date.now();
		let calls = 0;
		vi.spyOn(Date, "now").mockImplementation(() => {
			calls += 1;
			return base + calls * 30_000;
		});

		await expect(
			acquireLoginSlot({ userId: "u3" }, "u3@example.com"),
		).rejects.toThrow(LoginSlotError);

		expect(manageAllowlistEntryMock.trigger).not.toHaveBeenCalled();
		expect(queueMock.settleWaitingRequest).toHaveBeenCalledWith(
			1,
			"failed",
			expect.any(String),
		);
	});
});

describe("releaseLoginSlot", () => {
	afterEach(() => {
		resultsQueue.length = 0;
		vi.clearAllMocks();
	});

	it("removes the email and releases the slot", async () => {
		push([{ email: "u1@example.com" }]);
		manageAllowlistEntryMock.trigger.mockResolvedValue({ id: "run_1" });
		runsMock.poll.mockResolvedValue(successRun());

		await releaseLoginSlot(9);

		expect(manageAllowlistEntryMock.trigger).toHaveBeenCalledWith({
			email: "u1@example.com",
			action: "remove",
		});
		expect(queueMock.releaseSlot).toHaveBeenCalledWith(9);
		expect(queueMock.failActiveRequestForSlot).not.toHaveBeenCalled();
	});

	it("leaves the slot occupied for reclaim when the remove run fails", async () => {
		push([{ email: "u2@example.com" }]);
		manageAllowlistEntryMock.trigger.mockResolvedValue({ id: "run_1" });
		runsMock.poll.mockResolvedValue(failedRun("dashboard rejected the remove"));

		await releaseLoginSlot(5);

		expect(queueMock.releaseSlot).not.toHaveBeenCalled();
		expect(queueMock.failActiveRequestForSlot).toHaveBeenCalledWith(
			5,
			"dashboard rejected the remove",
		);
	});

	it("releases without a remove call when the slot has no email on record", async () => {
		push([{ email: null }]);

		await releaseLoginSlot(2);

		expect(manageAllowlistEntryMock.trigger).not.toHaveBeenCalled();
		expect(queueMock.releaseSlot).toHaveBeenCalledWith(2);
	});
});
