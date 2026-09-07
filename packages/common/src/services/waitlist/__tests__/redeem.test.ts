import { afterEach, describe, expect, it, vi } from "vitest";

const { db: dbMock, resultsQueue } = vi.hoisted(() => {
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
	const db = { select: () => chain() };
	return { db, resultsQueue };
});

vi.mock("@sonaraem/db", () => ({ db: dbMock }));
vi.mock("@sonaraem/logger", () => ({
	logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import { getWaitlistInviteIdentity } from "../redeem";

function push(...values: unknown[]) {
	resultsQueue.push(...values);
}

describe("getWaitlistInviteIdentity", () => {
	afterEach(() => {
		resultsQueue.length = 0;
		vi.clearAllMocks();
	});

	it("returns null for a malformed token without querying the db", async () => {
		const result = await getWaitlistInviteIdentity("not-a-valid-token");
		expect(result).toBeNull();
	});

	it("returns the identity for a valid token matching a row with a spotifyEmail", async () => {
		const rawToken = "a".repeat(64);
		push([{ id: 7, spotifyEmail: "user@spotify.example" }]);

		const result = await getWaitlistInviteIdentity(rawToken);

		expect(result).toEqual({
			waitlistSignupId: 7,
			spotifyEmail: "user@spotify.example",
		});
	});

	it("returns null when no row matches the hashed token", async () => {
		push([]);
		const result = await getWaitlistInviteIdentity("b".repeat(64));
		expect(result).toBeNull();
	});

	it("returns null when the matched row has no spotifyEmail on record", async () => {
		push([{ id: 3, spotifyEmail: null }]);
		const result = await getWaitlistInviteIdentity("c".repeat(64));
		expect(result).toBeNull();
	});
});
