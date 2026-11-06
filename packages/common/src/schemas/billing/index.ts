import { z } from "zod";

export const planEnum = z.enum(["free", "pro"]);
export type Plan = z.infer<typeof planEnum>;

export const billingPlanOutputSchema = z.object({
	plan: planEnum,
	isPro: z.boolean(),
	planExpiresAt: z.coerce.date().nullable(),
	polarCustomerId: z.string().nullable(),
	polarSubscriptionId: z.string().nullable(),
	checkoutUrl: z.string().nullable(),
	portalUrl: z.string().nullable(),
});

export type BillingPlanOutput = z.infer<typeof billingPlanOutputSchema>;
