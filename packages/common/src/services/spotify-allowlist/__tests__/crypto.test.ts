import { describe, expect, it, vi } from "vitest";

// 32 zero bytes, base64-encoded — a fixed key is fine for tests, only the shape (32 bytes) matters.
vi.mock("@sonaraem/env/server", () => ({
	env: {
		SONARAEM_SPOTIFY_ALLOWLIST_SESSION_KEY:
			"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
	},
}));

import { decryptSessionState, encryptSessionState } from "../crypto";

describe("spotify-allowlist crypto", () => {
	it("round-trips plaintext through encrypt/decrypt", () => {
		const plaintext = JSON.stringify({
			cookies: [{ name: "sid", value: "abc" }],
		});
		const payload = encryptSessionState(plaintext);
		expect(decryptSessionState(payload)).toBe(plaintext);
	});

	it("produces a different ciphertext each time (random IV)", () => {
		const a = encryptSessionState("same input");
		const b = encryptSessionState("same input");
		expect(a.ciphertext).not.toBe(b.ciphertext);
		expect(a.iv).not.toBe(b.iv);
	});

	it("rejects a tampered ciphertext", () => {
		const payload = encryptSessionState("secret state");
		const tampered = {
			...payload,
			ciphertext: `${payload.ciphertext.slice(0, -4)}abcd`,
		};
		expect(() => decryptSessionState(tampered)).toThrow();
	});

	it("rejects a tampered auth tag", () => {
		const payload = encryptSessionState("secret state");
		const tampered = {
			...payload,
			authTag: `${payload.authTag.slice(0, -4)}abcd`,
		};
		expect(() => decryptSessionState(tampered)).toThrow();
	});
});
