import { afterEach, describe, expect, it, vi } from "vitest";

// Chainable db/tx mock: every query-builder method returns `this`, awaiting resolves the next queued result.
const { db: dbMock, resultsQueue } = vi.hoisted(() => {
	const resultsQueue: unknown[] = [];
	function chain(): Record<string, unknown> {
		const obj: Record<string, unknown> = {};
		const passthrough = [
			"from",
			"where",
			"orderBy",
			"limit",
			"for",
			"set",
			"values",
		];
		for (const m of passthrough) obj[m] = () => obj;
		obj.returning = () => nextResult();
		// biome-ignore lint/suspicious/noThenProperty: intentionally thenable so `await tx.select()...` resolves to the queued mock result
		obj.then = (
			resolve: (v: unknown) => unknown,
			reject?: (e: unknown) => unknown,
		) => nextResult().then(resolve, reject);
		return obj;
	}
	function nextResult(): Promise<unknown> {
		const next = resultsQueue.shift();
		if (next instanceof Error) return Promise.reject(next);
		return Promise.resolve(next ?? []);
	}
	const db = {
		select: () => chain(),
		insert: () => chain(),
		update: () => chain(),
		transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(db)),
	};
	return { db, resultsQueue };
});

vi.mock("@sonaraem/db", () => ({ db: dbMock }));
vi.mock("@sonaraem/logger", () => ({
	logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import {
	confirmReclaimed,
	enqueue,
	nextEligibleForCron,
	releaseSlot,
	timeoutReclaim,
	tryAcquireSlot,
	yieldCheck,
} from "../queue";

function push(...values: unknown[]) {
	resultsQueue.push(...values);
}

describe("queue", () => {
	afterEach(() => {
		resultsQueue.length = 0;
		vi.clearAllMocks();
	});

	describe("enqueue", () => {
		it("creates a new request when none exists", async () => {
			push([{ id: 1 }]); // insert().values().returning()
			const result = await enqueue({ userId: "u1" }, "manual");
			expect(result).toEqual({ requestId: 1, alreadyQueued: false });
		});

		it("returns the existing live request on a unique-constraint conflict", async () => {
			const conflict = Object.assign(new Error("duplicate"), {
				code: "23505",
				constraint: "spotify_allowlist_queue_request_one_live_per_user",
			});
			push(conflict); // insert throws
			push([{ id: 7 }]); // select existing live request
			const result = await enqueue({ userId: "u1" }, "cron");
			expect(result).toEqual({ requestId: 7, alreadyQueued: true });
		});

		it("returns the existing live request when the pg error is wrapped in .cause", async () => {
			const pgError = Object.assign(new Error("duplicate"), {
				code: "23505",
				constraint: "spotify_allowlist_queue_request_one_live_per_user",
			});
			const wrapped = Object.assign(new Error("Failed query: insert..."), {
				cause: pgError,
			});
			push(wrapped); // insert throws, drizzle-wrapped
			push([{ id: 8 }]); // select existing live request
			const result = await enqueue({ userId: "u1" }, "cron");
			expect(result).toEqual({ requestId: 8, alreadyQueued: true });
		});

		it("re-throws errors that aren't the expected unique-constraint conflict", async () => {
			push(new Error("connection lost"));
			await expect(enqueue({ userId: "u1" }, "manual")).rejects.toThrow(
				"connection lost",
			);
		});

		it("uses the waitlist-signup constraint for pre-OAuth identities", async () => {
			const conflict = Object.assign(new Error("duplicate"), {
				code: "23505",
				constraint:
					"spotify_allowlist_queue_request_one_live_per_waitlist_signup",
			});
			push(conflict);
			push([{ id: 3 }]);
			const result = await enqueue({ waitlistSignupId: 42 }, "manual");
			expect(result).toEqual({ requestId: 3, alreadyQueued: true });
		});
	});

	describe("tryAcquireSlot", () => {
		it("refuses when the request is no longer waiting", async () => {
			push([{ id: 1, userId: "u1", status: "active", priority: "manual" }]); // request lookup
			const result = await tryAcquireSlot(1, "u1@example.com");
			expect(result).toEqual({ acquired: false, reason: "not-your-turn" });
		});

		it("refuses when a higher-priority request is ahead in line", async () => {
			push([{ id: 5, userId: "u1", status: "waiting", priority: "cron" }]); // request lookup
			push([{ id: 9 }]); // front-of-queue lookup — someone else
			const result = await tryAcquireSlot(5, "u1@example.com");
			expect(result).toEqual({ acquired: false, reason: "not-your-turn" });
		});

		it("refuses when it's this request's turn but no slot is free", async () => {
			push([{ id: 5, userId: "u1", status: "waiting", priority: "manual" }]); // request lookup
			push([{ id: 5 }]); // front-of-queue lookup — this one
			push([]); // no available slot
			const result = await tryAcquireSlot(5, "u1@example.com");
			expect(result).toEqual({ acquired: false, reason: "no-slot-available" });
		});

		it("acquires the slot when it's this request's turn and one is free", async () => {
			push([{ id: 5, userId: "u1", status: "waiting", priority: "manual" }]); // request lookup
			push([{ id: 5 }]); // front-of-queue lookup
			push([{ id: 2 }]); // available slot
			push([]); // slot update
			push([]); // request update
			const result = await tryAcquireSlot(5, "u1@example.com");
			expect(result).toEqual({ acquired: true, slotId: 2 });
		});

		it("acquires the slot for a login-priority request front-of-line", async () => {
			push([{ id: 8, userId: "u2", status: "waiting", priority: "login" }]); // request lookup
			push([{ id: 8 }]); // front-of-queue lookup (login pool)
			push([{ id: 4 }]); // available login slot
			push([]); // slot update
			push([]); // request update
			const result = await tryAcquireSlot(8, "u2@example.com");
			expect(result).toEqual({ acquired: true, slotId: 4 });
		});
	});

	describe("releaseSlot", () => {
		it("moves the slot back to available and marks the request done", async () => {
			push([]); // slot update
			push([]); // request update
			await expect(releaseSlot(2)).resolves.toBeUndefined();
			expect(dbMock.transaction).toHaveBeenCalledTimes(1);
		});
	});

	describe("confirmReclaimed", () => {
		it("moves a reclaiming slot to available", async () => {
			push([]); // slot update
			await expect(confirmReclaimed(1)).resolves.toBeUndefined();
		});
	});

	describe("timeoutReclaim", () => {
		it("does nothing when no slots are stuck", async () => {
			push([]); // slot update...returning() finds nothing stuck
			const reclaimed = await timeoutReclaim();
			expect(reclaimed).toEqual([]);
			expect(dbMock.transaction).toHaveBeenCalledTimes(1);
		});

		it("force-releases every stuck slot, fails its active request, and returns its email", async () => {
			push([
				{ id: 1, email: "a@example.com" },
				{ id: 2, email: "b@example.com" },
			]); // slot update...returning()
			push([], []); // 2 x request update
			const reclaimed = await timeoutReclaim();
			expect(reclaimed).toEqual([
				{ slotId: 1, email: "a@example.com" },
				{ slotId: 2, email: "b@example.com" },
			]);
			expect(dbMock.transaction).toHaveBeenCalledTimes(1);
		});
	});

	describe("yieldCheck", () => {
		it("is true when a manual request is waiting", async () => {
			push([{ id: 1 }]);
			await expect(yieldCheck()).resolves.toBe(true);
		});

		it("is true when a login request is waiting", async () => {
			push([{ id: 2 }]);
			await expect(yieldCheck()).resolves.toBe(true);
		});

		it("is false when nothing higher-priority than cron is waiting", async () => {
			push([]);
			await expect(yieldCheck()).resolves.toBe(false);
		});
	});

	describe("nextEligibleForCron", () => {
		it("returns eligible user ids", async () => {
			push([{ userId: "u1" }, { userId: "u2" }]);
			const ids = await nextEligibleForCron(4);
			expect(ids).toEqual(["u1", "u2"]);
		});
	});
});
