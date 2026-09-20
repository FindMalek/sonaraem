import { afterEach, describe, expect, it, vi } from "vitest";

const { db: dbMock, resultsQueue } = vi.hoisted(() => {
	const resultsQueue: unknown[] = [];
	function chain(): Record<string, unknown> {
		const obj: Record<string, unknown> = {};
		for (const m of ["from", "where", "values", "set", "limit", "orderBy"])
			obj[m] = () => obj;
		// biome-ignore lint/suspicious/noThenProperty: intentionally thenable so `await db.select()...` resolves to the queued mock result
		obj.then = (
			resolve: (v: unknown) => unknown,
			reject?: (e: unknown) => unknown,
		) => nextResult().then(resolve, reject);
		return obj;
	}
	function nextResult(): Promise<unknown> {
		const next = resultsQueue.shift() ?? [];
		if (next instanceof Error) return Promise.reject(next);
		return Promise.resolve(next);
	}
	// Same chain-backed mock for both the outer db and the tx, matching permanent-allowlist.test.ts.
	const txLike = {
		select: () => chain(),
		insert: () => chain(),
		update: () => chain(),
	};
	const db = {
		...txLike,
		transaction: (cb: (tx: typeof txLike) => Promise<unknown>) => cb(txLike),
	};
	return { db, resultsQueue };
});

vi.mock("@sonaraem/db", () => ({ db: dbMock }));

import {
	enqueueExport,
	enqueueSnapshotRefresh,
	getNextConsolidatedBatch,
	markJobsDone,
	markJobsFailed,
	requeueForBudget,
} from "../rotation-job";

function push(...values: unknown[]) {
	resultsQueue.push(...values);
}

describe("rotation job queue", () => {
	afterEach(() => {
		resultsQueue.length = 0;
		vi.clearAllMocks();
	});

	describe("enqueueSnapshotRefresh", () => {
		it("inserts when no unfinished job exists for the user", async () => {
			push([], undefined);
			await expect(enqueueSnapshotRefresh("user-1")).resolves.toBeUndefined();
		});

		it("is a no-op when a job is already queued for the user", async () => {
			push([{ id: 1 }]);
			await expect(enqueueSnapshotRefresh("user-1")).resolves.toBeUndefined();
		});
	});

	describe("enqueueExport", () => {
		it("inserts when no unfinished export job exists for the user", async () => {
			push([], undefined);
			await expect(enqueueExport("user-1", [10, 11])).resolves.toBeUndefined();
		});
	});

	describe("getNextConsolidatedBatch", () => {
		it("returns null when nothing is queued", async () => {
			push([]);
			await expect(getNextConsolidatedBatch()).resolves.toBeNull();
		});

		it("consolidates every queued job for the same user and marks them dispatched", async () => {
			push(
				[{ userId: "user-1" }],
				[
					{ id: 1, jobType: "snapshot_refresh", playlistIds: null },
					{ id: 2, jobType: "export", playlistIds: [10, 11] },
				],
				undefined,
			);

			await expect(getNextConsolidatedBatch()).resolves.toEqual({
				userId: "user-1",
				jobs: [
					{ id: 1, jobType: "snapshot_refresh", playlistIds: null },
					{ id: 2, jobType: "export", playlistIds: [10, 11] },
				],
			});
		});

		it("returns null if the picked user's jobs vanish before the follow-up query", async () => {
			push([{ userId: "user-1" }], []);
			await expect(getNextConsolidatedBatch()).resolves.toBeNull();
		});
	});

	describe("markJobsDone / markJobsFailed", () => {
		it("does nothing for an empty id list", async () => {
			await expect(markJobsDone([])).resolves.toBeUndefined();
			await expect(markJobsFailed([], "boom")).resolves.toBeUndefined();
			expect(resultsQueue).toHaveLength(0);
		});

		it("updates status for a non-empty id list", async () => {
			push(undefined);
			await expect(markJobsDone([1, 2])).resolves.toBeUndefined();
		});

		it("requeues a failed job with backoff", async () => {
			push(undefined);
			await expect(
				markJobsFailed([1], "spotify dashboard error"),
			).resolves.toBeUndefined();
		});
	});

	describe("requeueForBudget", () => {
		it("does nothing for an empty id list", async () => {
			await expect(requeueForBudget([])).resolves.toBeUndefined();
			expect(resultsQueue).toHaveLength(0);
		});

		it("requeues a budget-blocked job without touching retryCount", async () => {
			push(undefined);
			await expect(requeueForBudget([1])).resolves.toBeUndefined();
		});
	});
});
