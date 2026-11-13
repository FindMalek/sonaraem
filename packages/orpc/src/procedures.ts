import { ORPCError } from "@orpc/server";
import { isPro } from "@sonaraem/common";
import { db } from "@sonaraem/db";
import { user } from "@sonaraem/db/schema/auth";
import { env } from "@sonaraem/env/server";
import { eq } from "drizzle-orm";

import { rateLimitMiddleware } from "./middleware/rate-limit";
import { o } from "./os";
import { assertUserApproved } from "./utils/approval-gate";

export { o };

export const publicProcedure = o.use(rateLimitMiddleware);

const requireAuth = o.middleware(async ({ context, next }) => {
	if (!context.session?.user) {
		throw new ORPCError("UNAUTHORIZED");
	}
	return next({
		context: {
			session: context.session,
		},
	});
});

export const protectedProcedure = publicProcedure.use(requireAuth);

const requireApproved = o.middleware(async ({ context, next }) => {
	const userId = context.session?.user?.id;
	if (!userId) {
		throw new ORPCError("UNAUTHORIZED");
	}

	await assertUserApproved(userId);
	return next();
});

export const approvedProcedure = protectedProcedure.use(requireApproved);

export const planProcedure = approvedProcedure.use(
	async ({ context, next }) => {
		const userId = context.session.user.id;
		let isProUser = false;
		let userPlan: "free" | "pro" = "free";
		let planExpiresAt: Date | null = null;

		if (userId) {
			const [dbUser] = await db
				.select({
					plan: user.plan,
					planExpiresAt: user.planExpiresAt,
				})
				.from(user)
				.where(eq(user.id, userId))
				.limit(1);

			if (dbUser) {
				userPlan = (dbUser.plan as "free" | "pro") || "free";
				planExpiresAt = dbUser.planExpiresAt;
				isProUser = isPro({ plan: userPlan, planExpiresAt });
			}
		}

		return next({
			context: {
				plan: userPlan,
				planExpiresAt,
				isPro: isProUser,
			},
		});
	},
);

export const proProcedure = planProcedure.use(async ({ context, next }) => {
	if (!context.isPro) {
		throw new ORPCError("FORBIDDEN", {
			message: "This feature requires an active Pro plan.",
		});
	}
	return next();
});

const requireCronOrAuth = o.middleware(async ({ context, next }) => {
	const cronSecret =
		context.headers?.get("X-Organize-Secret") ??
		context.headers?.get("Authorization")?.replace(/^Bearer\s+/i, "");
	const isCron =
		env.SONARAEM_CRON_SECRET && cronSecret === env.SONARAEM_CRON_SECRET;
	const isAuth = !!context.session?.user;

	if (!isCron && !isAuth) {
		throw new ORPCError("UNAUTHORIZED");
	}

	return next({
		context: {
			...context,
			caller: (isCron ? "cron" : "user") as "cron" | "user",
			userId: isAuth ? context.session?.user.id : undefined,
		},
	});
});

export const cronOrAuthProcedure = publicProcedure.use(requireCronOrAuth);

const requireAdminAuth = o.middleware(async ({ context, next }) => {
	const adminUser = context.adminSession?.user;
	if (!adminUser) {
		throw new ORPCError("UNAUTHORIZED");
	}
	if (!("role" in adminUser) || adminUser.role !== "admin") {
		throw new ORPCError("FORBIDDEN");
	}
	return next({
		context: {
			adminSession: context.adminSession,
		},
	});
});

export const adminProcedure = publicProcedure.use(requireAdminAuth);
