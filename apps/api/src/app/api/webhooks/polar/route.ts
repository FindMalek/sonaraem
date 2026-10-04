import {
	processPolarWebhookEvent,
	verifyPolarWebhookEvent,
} from "@sonaraem/common/services/billing";
import { apiEnv } from "@sonaraem/env/presets/api";
import { logger } from "@sonaraem/logger";
import { type NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
	const webhookSecret =
		apiEnv.SONARAEM_POLAR_WEBHOOK_SECRET || apiEnv.POLAR_WEBHOOK_SECRET;

	if (!webhookSecret) {
		logger.error("Missing Polar webhook secret for webhook verification");
		return NextResponse.json(
			{ error: "Webhook secret is not configured" },
			{ status: 500 },
		);
	}

	const payload = await req.text();
	const id = req.headers.get("webhook-id") || req.headers.get("svix-id");
	const timestamp =
		req.headers.get("webhook-timestamp") || req.headers.get("svix-timestamp");
	const signature =
		req.headers.get("webhook-signature") || req.headers.get("svix-signature");

	if (!id || !timestamp || !signature) {
		logger.warn("Missing Polar webhook verification headers");
		return NextResponse.json(
			{ error: "Missing webhook signature headers" },
			{ status: 400 },
		);
	}

	const event = verifyPolarWebhookEvent({
		webhookSecret,
		payload,
		headers: {
			id,
			timestamp,
			signature,
		},
	});

	if (!event) {
		logger.warn("Invalid or unparseable Polar webhook payload");
		return NextResponse.json(
			{ error: "Invalid webhook signature or payload" },
			{ status: 400 },
		);
	}

	const result = await processPolarWebhookEvent(event);
	logger.info(result, "Processed Polar webhook event");

	return NextResponse.json({ ok: true, result });
}
