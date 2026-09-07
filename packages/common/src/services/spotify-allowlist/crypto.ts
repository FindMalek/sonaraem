import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "@sonaraem/env/server";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

export type EncryptedPayload = {
	ciphertext: string;
	iv: string;
	authTag: string;
};

function getKey(): Buffer {
	const key = env.SONARAEM_SPOTIFY_ALLOWLIST_SESSION_KEY;
	if (!key) {
		throw new Error("SONARAEM_SPOTIFY_ALLOWLIST_SESSION_KEY is not configured");
	}
	const buffer = Buffer.from(key, "base64");
	if (buffer.length !== 32) {
		throw new Error(
			"SONARAEM_SPOTIFY_ALLOWLIST_SESSION_KEY must be a base64-encoded 32-byte key",
		);
	}
	return buffer;
}

export function encryptSessionState(plaintext: string): EncryptedPayload {
	const iv = randomBytes(IV_LENGTH);
	const cipher = createCipheriv(ALGORITHM, getKey(), iv);
	const ciphertext = Buffer.concat([
		cipher.update(plaintext, "utf8"),
		cipher.final(),
	]);

	return {
		ciphertext: ciphertext.toString("base64"),
		iv: iv.toString("base64"),
		authTag: cipher.getAuthTag().toString("base64"),
	};
}

export function decryptSessionState(payload: EncryptedPayload): string {
	const decipher = createDecipheriv(
		ALGORITHM,
		getKey(),
		Buffer.from(payload.iv, "base64"),
	);
	decipher.setAuthTag(Buffer.from(payload.authTag, "base64"));

	const plaintext = Buffer.concat([
		decipher.update(Buffer.from(payload.ciphertext, "base64")),
		decipher.final(),
	]);

	return plaintext.toString("utf8");
}
