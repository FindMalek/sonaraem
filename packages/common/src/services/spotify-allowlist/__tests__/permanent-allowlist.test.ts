import { afterEach, describe, expect, it, vi } from "vitest";

const { db: dbMock, resultsQueue } = vi.hoisted(() => {
	const resultsQueue: unknown[] = [];
	function chain(): Record<string, unknown> {
		const obj: Record<string, unknown> = {};
		for (const m of ["from", "where", "values"]) obj[m] = () => obj;
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
	const db = {
		select: () => chain(),
		insert: () => chain(),
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
		push([], [{ count: 1 }], undefined);
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
		push([], [{ count: 4 }]);
		await expect(
			ensureAllowlisted({ waitlistSignupId: 1 }, "fifth@example.com"),
		).rejects.toBeInstanceOf(AllowlistCapacityError);
		expect(triggerAndWaitMock).not.toHaveBeenCalled();
	});

	it("treats a concurrent duplicate insert as success, not an error", async () => {
		push(
			[],
			[{ count: 0 }],
			Object.assign(new Error("duplicate"), {
				code: "23505",
				constraint: "spotify_allowlist_entry_email_unique",
			}),
		);
		triggerAndWaitMock.mockResolvedValueOnce({ confirmed: true });

		await expect(
			ensureAllowlisted({ userId: "user-2" }, "race@example.com"),
		).resolves.toEqual({ alreadyAllowlisted: false });
	});
});
