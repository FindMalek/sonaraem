import { createHmac, timingSafeEqual } from "node:crypto";
import { db, eq } from "@sonaraem/db";
import { user } from "@sonaraem/db/schema/auth";
import { logger } from "@sonaraem/logger";
import { z } from "zod";

export const polarWebhookEventSchema = z.object({
	type: z.string(),
	data: z.object({
		id: z.string(),
		status: z.string().optional(),
		current_period_end: z.string().nullable().optional(),
		cancel_at_period_end: z.boolean().nullable().optional(),
		ended_at: z.string().nullable().optional(),
		customer_id: z.string().optional(),
		customer: z
			.object({
				id: z.string().optional(),
				email: z.string().optional(),
			})
			.optional(),
		metadata: z.record(z.string(), z.unknown()).optional(),
	}),
});

export type PolarWebhookEvent = z.infer<typeof polarWebhookEventSchema>;

export function verifyPolarWebhookEvent({
	webhookSecret,
	payload,
	headers,
	toleranceInSeconds,
}: {
	webhookSecret: string;
	payload: string;
	headers: {
		id?: string | null;
		timestamp?: string | null;
		signature?: string | null;
	};
	toleranceInSeconds?: number;
}): PolarWebhookEvent | null {
	if (
		!webhookSecret ||
		typeof webhookSecret !== "string" ||
		webhookSecret.trim() === ""
	) {
		return null;
	}

	if (typeof payload !== "string") {
		return null;
	}

	const id = headers.id?.trim();
	const timestamp = headers.timestamp?.trim();
	const signature = headers.signature?.trim();

	if (!id || !timestamp || !signature) {
		return null;
	}

	if (toleranceInSeconds !== undefined && toleranceInSeconds > 0) {
		const timestampSec = Number.parseInt(timestamp, 10);
		if (Number.isNaN(timestampSec)) {
			return null;
		}
		const nowSec = Math.floor(Date.now() / 1000);
		if (Math.abs(nowSec - timestampSec) > toleranceInSeconds) {
			return null;
		}
	}

	try {
		const trimmedSecret = webhookSecret.trim();
		if (trimmedSecret === "whsec_") {
			return null;
		}

		const cleanSecret = trimmedSecret.startsWith("whsec_")
			? Buffer.from(trimmedSecret.slice(6), "base64")
			: Buffer.from(trimmedSecret, "utf-8");

		if (cleanSecret.length === 0) {
			return null;
		}

		const signedPayload = `${id}.${timestamp}.${payload}`;
		const expectedSignature = createHmac("sha256", cleanSecret)
			.update(signedPayload)
			.digest("base64");

		const signatures = signature
			.split(/\s+/)
			.filter((sig) => sig.startsWith("v1,"))
			.map((sig) => sig.slice(3));

		if (signatures.length === 0) {
			return null;
		}

		const isValid = signatures.some((sig) => {
			const expectedBuffer = Buffer.from(expectedSignature, "utf-8");
			const sigBuffer = Buffer.from(sig, "utf-8");
			return (
				expectedBuffer.length === sigBuffer.length &&
				timingSafeEqual(expectedBuffer, sigBuffer)
			);
		});

		if (isValid) {
			const parsed = JSON.parse(payload);
			const validated = polarWebhookEventSchema.safeParse(parsed);
			return validated.success ? validated.data : null;
		}
	} catch {
		return null;
	}

	return null;
}

export async function processPolarWebhookEvent(event: PolarWebhookEvent) {
	const { type, data } = event;
	const subscriptionId = data.id;
	const customerId = data.customer_id || data.customer?.id;
	const metadataUserId = data.metadata?.userId || data.metadata?.user_id;
	const customerEmail = data.customer?.email?.toLowerCase();

	// Locate target user by metadata, subscriptionId, customerId, or email
	let targetUser = null;

	if (metadataUserId && typeof metadataUserId === "string") {
		const [u] = await db
			.select()
			.from(user)
			.where(eq(user.id, metadataUserId))
			.limit(1);
		if (u) targetUser = u;
	}

	if (!targetUser && subscriptionId) {
		const [u] = await db
			.select()
			.from(user)
			.where(eq(user.polarSubscriptionId, subscriptionId))
			.limit(1);
		if (u) targetUser = u;
	}

	if (!targetUser && customerId) {
		const [u] = await db
			.select()
			.from(user)
			.where(eq(user.polarCustomerId, customerId))
			.limit(1);
		if (u) targetUser = u;
	}

	if (!targetUser && customerEmail) {
		const [u] = await db
			.select()
			.from(user)
			.where(eq(user.email, customerEmail))
			.limit(1);
		if (u) targetUser = u;
	}

	if (!targetUser) {
		logger.warn(
			{ subscriptionId, customerId, customerEmail, metadataUserId },
			"No matching user found for Polar webhook event",
		);
		return { success: false, reason: "user_not_found" };
	}

	switch (type) {
		case "subscription.created":
		case "subscription.active": {
			const expiresAt = data.current_period_end
				? new Date(data.current_period_end)
				: null;
			await db
				.update(user)
				.set({
					plan: "pro",
					planExpiresAt: expiresAt,
					polarCustomerId: customerId ?? targetUser.polarCustomerId,
					polarSubscriptionId: subscriptionId,
				})
				.where(eq(user.id, targetUser.id));

			logger.info(
				{ userId: targetUser.id, subscriptionId },
				"Upgraded user to Pro plan",
			);
			return { success: true, action: "upgraded", userId: targetUser.id };
		}

		case "subscription.updated": {
			const isStillActive =
				data.status === "active" || data.status === "trialing";
			const expiresAt = data.current_period_end
				? new Date(data.current_period_end)
				: null;

			await db
				.update(user)
				.set({
					plan: isStillActive ? "pro" : "free",
					planExpiresAt: expiresAt,
					polarCustomerId: customerId ?? targetUser.polarCustomerId,
					polarSubscriptionId: subscriptionId,
				})
				.where(eq(user.id, targetUser.id));

			logger.info(
				{
					userId: targetUser.id,
					status: data.status,
					plan: isStillActive ? "pro" : "free",
				},
				"Updated user subscription state",
			);
			return { success: true, action: "updated", userId: targetUser.id };
		}

		case "subscription.canceled": {
			const expiresAt =
				data.cancel_at_period_end && data.current_period_end
					? new Date(data.current_period_end)
					: new Date();
			const isExpired = expiresAt.getTime() <= Date.now();

			await db
				.update(user)
				.set({
					plan: isExpired ? "free" : "pro",
					planExpiresAt: expiresAt,
				})
				.where(eq(user.id, targetUser.id));

			logger.info(
				{ userId: targetUser.id, expiresAt, isExpired },
				"Processed subscription cancellation",
			);
			return { success: true, action: "canceled", userId: targetUser.id };
		}

		case "subscription.revoked": {
			await db
				.update(user)
				.set({
					plan: "free",
					planExpiresAt: new Date(),
				})
				.where(eq(user.id, targetUser.id));

			logger.info({ userId: targetUser.id }, "Revoked user subscription");
			return { success: true, action: "revoked", userId: targetUser.id };
		}

		default: {
			logger.info({ type }, "Unhandled Polar webhook event type");
			return { success: true, action: "ignored" };
		}
	}
}
