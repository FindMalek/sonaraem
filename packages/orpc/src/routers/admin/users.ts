import { ORPCError } from "@orpc/server";
import {
	adminUserDeleteInput,
	adminUserListInput,
	adminUserListOutputSchema,
} from "@sonaraem/common/schemas";
import { db } from "@sonaraem/db";
import { user } from "@sonaraem/db/schema/auth";
import { count, desc, eq, ilike, or } from "drizzle-orm";
import { z } from "zod";

import { adminProcedure } from "../../procedures";

export const adminUsersRouter = {
	list: adminProcedure
		.input(adminUserListInput)
		.output(adminUserListOutputSchema)
		.handler(async ({ input }) => {
			const { page, pageSize, q } = input;
			const offset = (page - 1) * pageSize;

			const where = q
				? or(ilike(user.email, `%${q}%`), ilike(user.name, `%${q}%`))
				: undefined;

			const [items, totalRows] = await Promise.all([
				db
					.select({
						id: user.id,
						name: user.name,
						email: user.email,
						emailVerified: user.emailVerified,
						role: user.role,
						isApproved: user.isApproved,
						banned: user.banned,
						createdAt: user.createdAt,
					})
					.from(user)
					.where(where)
					.orderBy(desc(user.createdAt))
					.limit(pageSize)
					.offset(offset),
				db.select({ total: count() }).from(user).where(where),
			]);

			const total = totalRows[0]?.total ?? 0;

			return {
				items: items.map((item) => ({
					...item,
					banned: item.banned ?? false,
				})),
				total,
				page,
				pageSize,
				pageCount: Math.ceil(total / pageSize),
			};
		}),

	delete: adminProcedure
		.input(adminUserDeleteInput)
		.output(z.object({ success: z.boolean() }))
		.handler(async ({ input }) => {
			const [target] = await db
				.select({ role: user.role })
				.from(user)
				.where(eq(user.id, input.id));

			if (!target) {
				return { success: false };
			}

			// The one admin account (user_single_admin_idx) — no in-app recovery if deleted.
			if (target.role === "admin") {
				throw new ORPCError("BAD_REQUEST", {
					message: "Cannot delete the admin account.",
				});
			}

			await db.delete(user).where(eq(user.id, input.id));
			return { success: true };
		}),
};
