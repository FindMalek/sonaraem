import { afterEach, describe, expect, it, vi } from "vitest";

const { db: dbMock, resultsQueue } = vi.hoisted(() => {
	const resultsQueue: unknown[] = [];
	function chain(): Record<string, unknown> {
		const obj: Record<string, unknown> = {};
		for (const m of ["from", "where", "set", "limit"]) obj[m] = () => obj;
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
	const db = { select: () => chain(), update: () => chain() };
	return { db, resultsQueue };
});

vi.mock("@sonaraem/db", () => ({ db: dbMock }));

import { backfillAllowlistEntryUserId } from "../rotation-entry";

function push(...values: unknown[]) {
	resultsQueue.push(...values);
}

describe("backfillAllowlistEntryUserId", () => {
	afterEach(() => {
		resultsQueue.length = 0;
		vi.clearAllMocks();
	});

	it("links the allowlist entry by email once the account exists", async () => {
		push([{ email: "friend@example.com" }], undefined);
		await expect(
			backfillAllowlistEntryUserId("user-1"),
		).resolves.toBeUndefined();
	});

	it("does nothing when the account has no email on record", async () => {
		push([]);
		await expect(
			backfillAllowlistEntryUserId("user-1"),
		).resolves.toBeUndefined();
		expect(resultsQueue).toHaveLength(0);
	});
});
