import { afterEach, describe, expect, it, vi } from "vitest";

const { db: dbMock, resultsQueue } = vi.hoisted(() => {
	const resultsQueue: unknown[] = [];
	function chain(): Record<string, unknown> {
		const obj: Record<string, unknown> = {};
		for (const m of ["from", "where", "values", "returning"])
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
	// Same chain-backed mock for both the outer db and the tx handed to db.transaction's callback —
	// the transaction is just a serialization boundary here, not a separate connection.
	const txLike = {
		select: () => chain(),
		insert: () => chain(),
		delete: () => chain(),
		execute: () => chain(),
	};
	const db = {
		...txLike,
		transaction: (cb: (tx: typeof txLike) => Promise<unknown>) => cb(txLike),
	};
	return { db, resultsQueue };
});

const triggerAndWaitMock = vi.hoisted(() => vi.fn());

vi.mock("@sonaraem/db", () => ({ db: dbMock }));
vi.mock(
	"../../../trigger/tasks/spotify-allowlist/manage-allowlist-entry",
	() => ({
		manageAllowlistEntryTask: {
			triggerAndWait: (...args: unknown[]) => ({
				unwrap: () => triggerAndWaitMock(...args),
			}),
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
		await expect(isIdentityAllowlisted("new@example.com")).resolves.toBe(false);
	});

	it("reports true when an email already has an entry", async () => {
		push([{ id: 1 }]);
		await expect(isIdentityAllowlisted("old@example.com")).resolves.toBe(true);
	});

	it("skips the Spotify call entirely for an already-allowlisted email", async () => {
		push([{ id: 1 }]);
		const result = await ensureAllowlisted(
			{ userId: "user-1" },
			"old@example.com",
		);
		expect(result).toEqual({ alreadyAllowlisted: true });
		expect(triggerAndWaitMock).not.toHaveBeenCalled();
	});

	it("adds a new email and records it once capacity allows", async () => {
		// isIdentityAllowlisted pre-check, tx advisory lock, tx existing-by-email check, tx count, tx insert...returning
		push([], undefined, [], [{ count: 1 }], [{ id: 7 }]);
		triggerAndWaitMock.mockResolvedValueOnce({ confirmed: true });

		const result = await ensureAllowlisted(
			{ waitlistSignupId: 42 },
			"new@example.com",
		);

		expect(result).toEqual({ alreadyAllowlisted: false });
		expect(triggerAndWaitMock).toHaveBeenCalledWith({
			email: "new@example.com",
			action: "add",
		});
	});

	it("throws AllowlistCapacityError before calling Spotify once the cap is reached", async () => {
		push([], undefined, [], [{ count: 4 }]);
		await expect(
			ensureAllowlisted({ waitlistSignupId: 1 }, "fifth@example.com"),
		).rejects.toBeInstanceOf(AllowlistCapacityError);
		expect(triggerAndWaitMock).not.toHaveBeenCalled();
	});

	it("treats a concurrent duplicate as already-allowlisted, not an error", async () => {
		// The advisory lock serializes racing callers — by the time the second one gets the lock,
		// the first's row is already committed, so the existing-by-email check inside the tx finds it.
		push([], undefined, [{ id: 9 }]);

		await expect(
			ensureAllowlisted({ userId: "user-2" }, "race@example.com"),
		).resolves.toEqual({ alreadyAllowlisted: true });
		expect(triggerAndWaitMock).not.toHaveBeenCalled();
	});

	it("deletes the reserved row and rethrows if the Spotify add fails", async () => {
		push([], undefined, [], [{ count: 1 }], [{ id: 8 }]);
		triggerAndWaitMock.mockRejectedValueOnce(new Error("spotify down"));

		await expect(
			ensureAllowlisted({ waitlistSignupId: 2 }, "fails@example.com"),
		).rejects.toThrow("spotify down");
	});
});
