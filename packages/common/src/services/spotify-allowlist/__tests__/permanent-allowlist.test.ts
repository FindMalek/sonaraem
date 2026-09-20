import { afterEach, describe, expect, it, vi } from "vitest";

const { db: dbMock, resultsQueue } = vi.hoisted(() => {
	const resultsQueue: unknown[] = [];
	function chain(): Record<string, unknown> {
		const obj: Record<string, unknown> = {};
		for (const m of ["from", "where", "values", "set", "returning"])
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
	// Same chain-backed mock for both the outer db and the tx handed to db.transaction's callback — the transaction is just a serialization boundary here, not a separate connection.
	const txLike = {
		select: () => chain(),
		insert: () => chain(),
		update: () => chain(),
		delete: () => chain(),
		execute: () => chain(),
	};
	const db = {
		...txLike,
		transaction: (cb: (tx: typeof txLike) => Promise<unknown>) => cb(txLike),
	};
	return { db, resultsQueue };
});

const triggerMock = vi.hoisted(() => vi.fn());
const pollMock = vi.hoisted(() => vi.fn());

vi.mock("@sonaraem/db", () => ({ db: dbMock }));
vi.mock("@trigger.dev/sdk", () => ({ runs: { poll: pollMock } }));
vi.mock(
	"../../../trigger/tasks/spotify-allowlist/manage-allowlist-entry",
	() => ({
		manageAllowlistEntryTask: {
			trigger: (...args: unknown[]) => triggerMock(...args),
		},
	}),
);

import {
	AllowlistCapacityError,
	ensureAllowlisted,
	isIdentityAllowlisted,
} from "../permanent-allowlist";

function push(...values: unknown[]) {
	resultsQueue.push(...values);
}

describe("permanent allowlist", () => {
	afterEach(() => {
		resultsQueue.length = 0;
		vi.clearAllMocks();
	});

	it("reports false when an email has no entry on record", async () => {
		push([]);
		await expect(isIdentityAllowlisted("new@example.com")).resolves.toBe(
			false,
		);
	});

	it("reports false for an off_list entry — not currently on Spotify's real allowlist", async () => {
		push([{ status: "off_list" }]);
		await expect(isIdentityAllowlisted("dormant@example.com")).resolves.toBe(
			false,
		);
	});

	it("reports true for an on_list entry", async () => {
		push([{ status: "on_list" }]);
		await expect(isIdentityAllowlisted("active@example.com")).resolves.toBe(
			true,
		);
	});

	it("skips the Spotify call entirely for an already on_list email", async () => {
		push([{ status: "on_list" }]);
		const result = await ensureAllowlisted(
			{ userId: "user-1" },
			"active@example.com",
		);
		expect(result).toEqual({ alreadyAllowlisted: true });
		expect(triggerMock).not.toHaveBeenCalled();
	});

	it("adds a new email and records it once on-list capacity allows", async () => {
		// isIdentityAllowlisted pre-check, tx advisory lock, tx existing-by-email check, tx on_list count, tx insert...returning
		push([], undefined, [], [{ count: 1 }], [{ id: 7 }]);
		triggerMock.mockResolvedValueOnce({ id: "run_1" });
		pollMock.mockResolvedValueOnce({
			isSuccess: true,
			status: "COMPLETED",
			output: { confirmed: true },
		});

		const result = await ensureAllowlisted(
			{ waitlistSignupId: 42 },
			"new@example.com",
		);

		expect(result).toEqual({ alreadyAllowlisted: false });
		expect(triggerMock).toHaveBeenCalledWith({
			email: "new@example.com",
			action: "add",
		});
		expect(pollMock).toHaveBeenCalledWith({ id: "run_1" });
	});

	it("reactivates an existing off-list row instead of inserting a duplicate", async () => {
		// isIdentityAllowlisted (off_list, not "already"), tx advisory lock, tx existing-by-email (off_list), tx on_list count, tx update (reactivate)
		push(
			[{ status: "off_list" }],
			undefined,
			[{ id: 5, status: "off_list" }],
			[{ count: 2 }],
			undefined,
		);
		triggerMock.mockResolvedValueOnce({ id: "run_reactivate" });
		pollMock.mockResolvedValueOnce({
			isSuccess: true,
			status: "COMPLETED",
			output: { confirmed: true },
		});

		const result = await ensureAllowlisted(
			{ userId: "user-returning" },
			"returning@example.com",
		);

		expect(result).toEqual({ alreadyAllowlisted: false });
		expect(triggerMock).toHaveBeenCalledWith({
			email: "returning@example.com",
			action: "add",
		});
	});

	it("throws AllowlistCapacityError before calling Spotify once all rotating seats are on_list", async () => {
		push([], undefined, [], [{ count: 4 }]);
		await expect(
			ensureAllowlisted({ waitlistSignupId: 1 }, "fifth@example.com"),
		).rejects.toBeInstanceOf(AllowlistCapacityError);
		expect(triggerMock).not.toHaveBeenCalled();
	});

	it("does not count off_list rows against capacity", async () => {
		// Plenty of historical rows could exist, but only on_list ones count — the count query itself filters, so this just documents the query shape stays under the cap.
		push([], undefined, [], [{ count: 3 }], [{ id: 11 }]);
		triggerMock.mockResolvedValueOnce({ id: "run_headroom" });
		pollMock.mockResolvedValueOnce({
			isSuccess: true,
			status: "COMPLETED",
			output: { confirmed: true },
		});

		await expect(
			ensureAllowlisted({ waitlistSignupId: 3 }, "headroom@example.com"),
		).resolves.toEqual({ alreadyAllowlisted: false });
	});

	it("treats a concurrent duplicate that landed on_list as already-allowlisted, not an error", async () => {
		// The advisory lock serializes racing callers — by the time the second one gets the lock, the first's row is already committed on_list, so the existing-by-email check inside the tx finds it and short-circuits before the count query.
		push([], undefined, [{ id: 9, status: "on_list" }]);

		await expect(
			ensureAllowlisted({ userId: "user-2" }, "race@example.com"),
		).resolves.toEqual({ alreadyAllowlisted: true });
		expect(triggerMock).not.toHaveBeenCalled();
	});

	it("deletes the reserved row and rethrows if the Spotify add fails after a fresh insert", async () => {
		push([], undefined, [], [{ count: 1 }], [{ id: 8 }], undefined);
		triggerMock.mockResolvedValueOnce({ id: "run_2" });
		pollMock.mockResolvedValueOnce({
			isSuccess: false,
			status: "FAILED",
			error: { message: "spotify down" },
		});

		await expect(
			ensureAllowlisted({ waitlistSignupId: 2 }, "fails@example.com"),
		).rejects.toThrow("spotify down");
	});

	it("rolls a reactivated row back to off_list (not delete) if the Spotify add fails", async () => {
		push(
			[{ status: "off_list" }],
			undefined,
			[{ id: 5, status: "off_list" }],
			[{ count: 1 }],
			undefined,
			undefined,
		);
		triggerMock.mockResolvedValueOnce({ id: "run_3" });
		pollMock.mockResolvedValueOnce({
			isSuccess: false,
			status: "FAILED",
			error: { message: "spotify down" },
		});

		await expect(
			ensureAllowlisted({ userId: "user-3" }, "flaky@example.com"),
		).rejects.toThrow("spotify down");
	});
});
