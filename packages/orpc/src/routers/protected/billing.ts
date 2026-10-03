import { isPro } from "@sonaraem/common";
import { billingPlanOutputSchema, emptyInput } from "@sonaraem/common/schemas";
import { db } from "@sonaraem/db";
import { user } from "@sonaraem/db/schema/auth";
import { env } from "@sonaraem/env/server";
import { eq } from "drizzle-orm";

import { approvedProcedure } from "../../procedures";

export const billingRouter = {
	getPlan: approvedProcedure
		.input(emptyInput)
		.output(billingPlanOutputSchema)
		.handler(async ({ context }) => {
			const userId = context.session.user.id;
			const [userRecord] = await db
				.select({
					plan: user.plan,
					planExpiresAt: user.planExpiresAt,
					polarCustomerId: user.polarCustomerId,
					polarSubscriptionId: user.polarSubscriptionId,
				})
				.from(user)
				.where(eq(user.id, userId))
				.limit(1);

			const currentPlan = (userRecord?.plan as "free" | "pro") || "free";
			const planExpiresAt = userRecord?.planExpiresAt ?? null;
			const pro = isPro({ plan: currentPlan, planExpiresAt });

			const checkoutUrl =
				env.SONARAEM_POLAR_PRO_CHECKOUT_URL ||
				(env.SONARAEM_POLAR_ORGANIZATION_ID
					? `https://polar.sh/${env.SONARAEM_POLAR_ORGANIZATION_ID}/subscriptions`
					: null);

			const portalUrl = userRecord?.polarCustomerId
				? "https://polar.sh/purchases/subscriptions"
				: null;

			return {
				plan: pro ? ("pro" as const) : ("free" as const),
				isPro: pro,
				planExpiresAt,
				polarCustomerId: userRecord?.polarCustomerId ?? null,
				polarSubscriptionId: userRecord?.polarSubscriptionId ?? null,
				checkoutUrl,
				portalUrl,
			};
		}),
};
