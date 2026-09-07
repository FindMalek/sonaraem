import { afterEach, describe, expect, it, vi } from "vitest";

const { db: dbMock, resultsQueue } = vi.hoisted(() => {
	const resultsQueue: unknown[] = [];
	function chain(): Record<string, unknown> {
		const obj: Record<string, unknown> = {};
		for (const m of ["from", "where", "values", "set", "target"])
			obj[m] = () => obj;
		obj.onConflictDoUpdate = () => nextResult();
		// biome-ignore lint/suspicious/noThenProperty: intentionally thenable so `await db.select()...` resolves to the queued mock result
		obj.then = (
			resolve: (v: unknown) => unknown,
			reject?: (e: unknown) => unknown,
		) => nextResult().then(resolve, reject);
		return obj;
	}
	function nextResult(): Promise<unknown> {
		return Promise.resolve(resultsQueue.shift() ?? []);
	}
	const db = {
		select: () => chain(),
		insert: () => chain(),
		update: () => chain(),
		delete: () => chain(),
	};
	return { db, resultsQueue };
});

vi.mock("@sonaraem/db", () => ({ db: dbMock }));
vi.mock("../crypto", () => ({
	encryptSessionState: vi.fn((plaintext: string) => ({
		ciphertext: `enc:${plaintext}`,
		iv: "iv",
		authTag: "tag",
	})),
	decryptSessionState: vi.fn((payload: { ciphertext: string }) =>
		payload.ciphertext.replace(/^enc:/, ""),
	),
}));

import {
	clearAllowlistSession,
	getLastAllowlistWriteAt,
	loadAllowlistSession,
	recordAllowlistWriteNow,
	saveAllowlistSession,
} from "../session";

function push(...values: unknown[]) {
	resultsQueue.push(...values);
}

describe("allowlist session persistence", () => {
	afterEach(() => {
		resultsQueue.length = 0;
		vi.clearAllMocks();
	});

	it("saves an encrypted session via upsert", async () => {
		push(undefined);
		await expect(saveAllowlistSession("cookies-json")).resolves.toBeUndefined();
	});

	it("returns null when no session is stored", async () => {
		push([]);
		await expect(loadAllowlistSession()).resolves.toBeNull();
	});

	it("decrypts a stored session", async () => {
		push([{ ciphertext: "enc:cookies-json", iv: "iv", authTag: "tag" }]);
		await expect(loadAllowlistSession()).resolves.toBe("cookies-json");
	});

	it("returns null if decryption fails", async () => {
		const { decryptSessionState } = await import("../crypto");
		vi.mocked(decryptSessionState).mockImplementationOnce(() => {
			throw new Error("bad key");
		});
		push([{ ciphertext: "enc:x", iv: "iv", authTag: "tag" }]);
		await expect(loadAllowlistSession()).resolves.toBeNull();
	});

	it("clears the stored session", async () => {
		push(undefined);
		await expect(clearAllowlistSession()).resolves.toBeUndefined();
	});

	it("returns null when no write has ever been recorded", async () => {
		push([{ lastWriteAt: null }]);
		await expect(getLastAllowlistWriteAt()).resolves.toBeNull();
	});

	it("returns the last recorded write time", async () => {
		const when = new Date("2026-01-01T00:00:00Z");
		push([{ lastWriteAt: when }]);
		await expect(getLastAllowlistWriteAt()).resolves.toEqual(when);
	});

	it("records the current time as the last write", async () => {
		push(undefined);
		await expect(recordAllowlistWriteNow()).resolves.toBeUndefined();
	});
});
