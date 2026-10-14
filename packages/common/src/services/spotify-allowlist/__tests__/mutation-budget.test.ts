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

vi.mock("@sonaraem/db", () => ({ db: dbMock }));

import {
	countMutationsInWindow,
	getMutationBudgetStatus,
	hasMutationBudget,
	recordMutation,
} from "../mutation-budget";

function push(...values: unknown[]) {
	resultsQueue.push(...values);
}

describe("mutation budget", () => {
	afterEach(() => {
		resultsQueue.length = 0;
		vi.clearAllMocks();
	});

	it("counts mutations from the query result", async () => {
		push([{ count: 3 }]);
		await expect(countMutationsInWindow("add")).resolves.toBe(3);
	});

	it("treats an empty result as zero", async () => {
		push([]);
		await expect(countMutationsInWindow("remove")).resolves.toBe(0);
	});

	it("has budget when used is below the limit", async () => {
		push([{ count: 3 }]);
		await expect(hasMutationBudget("add", 4)).resolves.toBe(true);
	});

	it("has no budget once used reaches the limit", async () => {
		push([{ count: 4 }]);
		await expect(hasMutationBudget("add", 4)).resolves.toBe(false);
	});

	it("reports combined add/remove status", async () => {
		push([{ count: 2 }], [{ count: 4 }]);
		await expect(getMutationBudgetStatus(4)).resolves.toEqual({
			add: { used: 2, limit: 4, remaining: 2 },
			remove: { used: 4, limit: 4, remaining: 0 },
		});
	});

	it("records a mutation via insert without throwing", async () => {
		push(undefined);
		await expect(
			recordMutation("add", "USER@Example.com"),
		).resolves.toBeUndefined();
	});
});
