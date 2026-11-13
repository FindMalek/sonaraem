import { describe, expect, it } from "vitest";
import { isPro } from "../plan";

describe("isPro utility", () => {
	it("returns false for null or undefined user", () => {
		expect(isPro(null)).toBe(false);
		expect(isPro(undefined)).toBe(false);
		expect(isPro()).toBe(false);
	});

	it("returns false for a user on the free plan", () => {
		expect(isPro({ plan: "free" })).toBe(false);
		expect(isPro({ plan: "free", planExpiresAt: null })).toBe(false);
		expect(
			isPro({
				plan: "free",
				planExpiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
			}),
		).toBe(false);
	});

	it("returns false for undefined or unrecognized plan names", () => {
		expect(isPro({ plan: undefined })).toBe(false);
		expect(isPro({ plan: "" })).toBe(false);
		expect(isPro({ plan: "starter" })).toBe(false);
	});

	it("returns true for pro plan when planExpiresAt is null (active recurring)", () => {
		expect(isPro({ plan: "pro", planExpiresAt: null })).toBe(true);
		expect(isPro({ plan: "pro" })).toBe(true);
	});

	it("returns true for pro plan with future expiration Date", () => {
		const future = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30); // +30 days
		expect(isPro({ plan: "pro", planExpiresAt: future })).toBe(true);
	});

	it("returns true for pro plan with future expiration ISO string", () => {
		const futureIso = new Date(
			Date.now() + 1000 * 60 * 60 * 24 * 14,
		).toISOString();
		expect(isPro({ plan: "pro", planExpiresAt: futureIso })).toBe(true);
	});

	it("returns false for pro plan with past expiration date", () => {
		const past = new Date(Date.now() - 1000 * 60 * 60); // 1 hour ago
		expect(isPro({ plan: "pro", planExpiresAt: past })).toBe(false);
	});

	it("returns false for pro plan with past expiration string", () => {
		const pastIso = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString();
		expect(isPro({ plan: "pro", planExpiresAt: pastIso })).toBe(false);
	});

	it("returns false for invalid date strings", () => {
		expect(isPro({ plan: "pro", planExpiresAt: "invalid-date" })).toBe(false);
	});
});
