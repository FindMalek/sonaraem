import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDbUpdate = vi.fn();
const mockDbSet = vi.fn();
const mockDbWhere = vi.fn();
const mockDbSelect = vi.fn();
const mockDbFrom = vi.fn();
const mockDbLimit = vi.fn();

vi.mock("@sonaraem/db", () => {
	const db = {
		update: (table: unknown) => {
			mockDbUpdate(table);
			return {
				set: (values: unknown) => {
					mockDbSet(values);
					return {
						where: (cond: unknown) => {
							mockDbWhere(cond);
							return Promise.resolve([{ id: "user_123" }]);
						},
					};
				},
			};
		},
		select: () => {
			mockDbSelect();
			return {
				from: (table: unknown) => {
					mockDbFrom(table);
					return {
						where: (cond: unknown) => {
							mockDbWhere(cond);
							return {
								limit: (n: number) => {
									mockDbLimit(n);
									return Promise.resolve([
										{
											id: "user_123",
											email: "user@example.com",
											plan: "free",
											planExpiresAt: null,
											polarCustomerId: "cus_123",
											polarSubscriptionId: "sub_123",
										},
									]);
								},
							};
						},
					};
				},
			};
		},
	};
	return {
		db,
		eq: vi.fn(),
		or: vi.fn(),
	};
});

vi.mock("@sonaraem/db/schema/auth", () => ({
	user: {
		id: "id",
		email: "email",
		plan: "plan",
		planExpiresAt: "plan_expires_at",
		polarCustomerId: "polar_customer_id",
		polarSubscriptionId: "polar_subscription_id",
	},
}));

vi.mock("@sonaraem/logger", () => ({
	logger: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

import { processPolarWebhookEvent, verifyPolarWebhookEvent } from "../polar";

describe("Polar Webhook Verification", () => {
	const secret = "test_webhook_secret_key";
	const samplePayload = JSON.stringify({
		type: "subscription.created",
		data: {
			id: "sub_123",
			status: "active",
			customer_id: "cus_123",
		},
	});

	it("verifies with standard HMAC webhook headers", () => {
		const id = "msg_123";
		const timestamp = "1700000000";
		const signedPayload = `${id}.${timestamp}.${samplePayload}`;
		const sig = createHmac("sha256", Buffer.from(secret, "utf-8"))
			.update(signedPayload)
			.digest("base64");

		const result = verifyPolarWebhookEvent({
			webhookSecret: secret,
			payload: samplePayload,
			headers: {
				id,
				timestamp,
				signature: `v1,${sig}`,
			},
		});

		expect(result).not.toBeNull();
		expect(result?.type).toBe("subscription.created");
		expect(result?.data.id).toBe("sub_123");
	});

	it("verifies with whsec_ base64 encoded secret", () => {
		const rawKey = "whsec_test_secret_for_base64_hmac";
		const base64Key = Buffer.from(rawKey).toString("base64");
		const whsecSecret = `whsec_${base64Key}`;
		const id = "msg_whsec";
		const timestamp = "1700000001";
		const signedPayload = `${id}.${timestamp}.${samplePayload}`;
		const sig = createHmac("sha256", Buffer.from(base64Key, "base64"))
			.update(signedPayload)
			.digest("base64");

		const result = verifyPolarWebhookEvent({
			webhookSecret: whsecSecret,
			payload: samplePayload,
			headers: {
				id,
				timestamp,
				signature: `v1,${sig}`,
			},
		});

		expect(result).not.toBeNull();
		expect(result?.type).toBe("subscription.created");
	});

	it("verifies when signature header contains multiple space-separated signatures", () => {
		const id = "msg_123";
		const timestamp = "1700000000";
		const signedPayload = `${id}.${timestamp}.${samplePayload}`;
		const sig = createHmac("sha256", Buffer.from(secret, "utf-8"))
			.update(signedPayload)
			.digest("base64");

		const result = verifyPolarWebhookEvent({
			webhookSecret: secret,
			payload: samplePayload,
			headers: {
				id,
				timestamp,
				signature: `v1,old_rotated_sig v1,${sig}`,
			},
		});

		expect(result).not.toBeNull();
		expect(result?.type).toBe("subscription.created");
	});

	it("rejects invalid HMAC signature", () => {
		const result = verifyPolarWebhookEvent({
			webhookSecret: secret,
			payload: samplePayload,
			headers: {
				id: "msg_123",
				timestamp: "1700000000",
				signature: "v1,invalid_signature",
			},
		});

		expect(result).toBeNull();
	});

	it("rejects forged signature when payload is modified", () => {
		const id = "msg_123";
		const timestamp = "1700000000";
		const signedPayload = `${id}.${timestamp}.${samplePayload}`;
		const sig = createHmac("sha256", Buffer.from(secret, "utf-8"))
			.update(signedPayload)
			.digest("base64");

		const tamperedPayload = JSON.stringify({
			type: "subscription.created",
			data: {
				id: "sub_fraud_456",
				status: "active",
				customer_id: "cus_fraud",
			},
		});

		const result = verifyPolarWebhookEvent({
			webhookSecret: secret,
			payload: tamperedPayload,
			headers: {
				id,
				timestamp,
				signature: `v1,${sig}`,
			},
		});

		expect(result).toBeNull();
	});

	it("rejects forged signature when timestamp is modified", () => {
		const id = "msg_123";
		const timestamp = "1700000000";
		const signedPayload = `${id}.${timestamp}.${samplePayload}`;
		const sig = createHmac("sha256", Buffer.from(secret, "utf-8"))
			.update(signedPayload)
			.digest("base64");

		const result = verifyPolarWebhookEvent({
			webhookSecret: secret,
			payload: samplePayload,
			headers: {
				id,
				timestamp: "1799999999",
				signature: `v1,${sig}`,
			},
		});

		expect(result).toBeNull();
	});

	it("rejects forged signature when id is modified", () => {
		const id = "msg_123";
		const timestamp = "1700000000";
		const signedPayload = `${id}.${timestamp}.${samplePayload}`;
		const sig = createHmac("sha256", Buffer.from(secret, "utf-8"))
			.update(signedPayload)
			.digest("base64");

		const result = verifyPolarWebhookEvent({
			webhookSecret: secret,
			payload: samplePayload,
			headers: {
				id: "msg_different",
				timestamp,
				signature: `v1,${sig}`,
			},
		});

		expect(result).toBeNull();
	});

	it("rejects when webhook secret is empty or whitespace", () => {
		const id = "msg_123";
		const timestamp = "1700000000";

		const emptyResult = verifyPolarWebhookEvent({
			webhookSecret: "",
			payload: samplePayload,
			headers: {
				id,
				timestamp,
				signature: "v1,some_signature",
			},
		});
		expect(emptyResult).toBeNull();

		const whitespaceResult = verifyPolarWebhookEvent({
			webhookSecret: "   ",
			payload: samplePayload,
			headers: {
				id,
				timestamp,
				signature: "v1,some_signature",
			},
		});
		expect(whitespaceResult).toBeNull();
	});

	it("rejects when required signature headers are missing", () => {
		expect(
			verifyPolarWebhookEvent({
				webhookSecret: secret,
				payload: samplePayload,
				headers: {
					timestamp: "1700000000",
					signature: "v1,some_signature",
				},
			}),
		).toBeNull();

		expect(
			verifyPolarWebhookEvent({
				webhookSecret: secret,
				payload: samplePayload,
				headers: {
					id: "msg_123",
					signature: "v1,some_signature",
				},
			}),
		).toBeNull();

		expect(
			verifyPolarWebhookEvent({
				webhookSecret: secret,
				payload: samplePayload,
				headers: {
					id: "msg_123",
					timestamp: "1700000000",
				},
			}),
		).toBeNull();
	});

	it("rejects signature with mismatched length", () => {
		const result = verifyPolarWebhookEvent({
			webhookSecret: secret,
			payload: samplePayload,
			headers: {
				id: "msg_123",
				timestamp: "1700000000",
				signature: "v1,short",
			},
		});

		expect(result).toBeNull();
	});

	it("rejects invalid JSON payload despite valid HMAC signature", () => {
		const invalidJson = "{ not-valid-json";
		const id = "msg_123";
		const timestamp = "1700000000";
		const signedPayload = `${id}.${timestamp}.${invalidJson}`;
		const sig = createHmac("sha256", Buffer.from(secret, "utf-8"))
			.update(signedPayload)
			.digest("base64");

		const result = verifyPolarWebhookEvent({
			webhookSecret: secret,
			payload: invalidJson,
			headers: {
				id,
				timestamp,
				signature: `v1,${sig}`,
			},
		});

		expect(result).toBeNull();
	});

	it("rejects payload failing schema validation despite valid HMAC signature", () => {
		const invalidSchemaJson = JSON.stringify({ wrong: "format" });
		const id = "msg_123";
		const timestamp = "1700000000";
		const signedPayload = `${id}.${timestamp}.${invalidSchemaJson}`;
		const sig = createHmac("sha256", Buffer.from(secret, "utf-8"))
			.update(signedPayload)
			.digest("base64");

		const result = verifyPolarWebhookEvent({
			webhookSecret: secret,
			payload: invalidSchemaJson,
			headers: {
				id,
				timestamp,
				signature: `v1,${sig}`,
			},
		});

		expect(result).toBeNull();
	});
});

describe("Polar Webhook Processing", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("handles subscription.created by upgrading user to pro", async () => {
		const futureDate = new Date(
			Date.now() + 1000 * 60 * 60 * 24 * 30,
		).toISOString();
		const result = await processPolarWebhookEvent({
			type: "subscription.created",
			data: {
				id: "sub_123",
				status: "active",
				customer_id: "cus_123",
				current_period_end: futureDate,
				metadata: { userId: "user_123" },
			},
		});

		expect(result.success).toBe(true);
		expect(result.action).toBe("upgraded");
		expect(mockDbSet).toHaveBeenCalledWith(
			expect.objectContaining({
				plan: "pro",
				polarCustomerId: "cus_123",
				polarSubscriptionId: "sub_123",
			}),
		);
	});

	it("handles subscription.updated with active status", async () => {
		const futureDate = new Date(
			Date.now() + 1000 * 60 * 60 * 24 * 30,
		).toISOString();
		const result = await processPolarWebhookEvent({
			type: "subscription.updated",
			data: {
				id: "sub_123",
				status: "active",
				customer_id: "cus_123",
				current_period_end: futureDate,
			},
		});

		expect(result.success).toBe(true);
		expect(result.action).toBe("updated");
		expect(mockDbSet).toHaveBeenCalledWith(
			expect.objectContaining({
				plan: "pro",
			}),
		);
	});

	it("handles subscription.canceled by setting future expiration or immediate", async () => {
		const futureDate = new Date(
			Date.now() + 1000 * 60 * 60 * 24 * 10,
		).toISOString();
		const result = await processPolarWebhookEvent({
			type: "subscription.canceled",
			data: {
				id: "sub_123",
				status: "canceled",
				cancel_at_period_end: true,
				current_period_end: futureDate,
			},
		});

		expect(result.success).toBe(true);
		expect(result.action).toBe("canceled");
		expect(mockDbSet).toHaveBeenCalledWith(
			expect.objectContaining({
				plan: "pro", // Remains pro until period end
			}),
		);
	});

	it("handles subscription.revoked by setting plan to free immediately", async () => {
		const result = await processPolarWebhookEvent({
			type: "subscription.revoked",
			data: {
				id: "sub_123",
				status: "revoked",
			},
		});

		expect(result.success).toBe(true);
		expect(result.action).toBe("revoked");
		expect(mockDbSet).toHaveBeenCalledWith(
			expect.objectContaining({
				plan: "free",
			}),
		);
	});
});
