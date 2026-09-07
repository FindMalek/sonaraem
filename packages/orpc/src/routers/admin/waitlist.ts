import { createHash, randomBytes } from "node:crypto";
import { ORPCError } from "@orpc/server";
import {
	waitlistAdminBulkIdsInput,
	waitlistAdminListInput,
	waitlistAdminListOutputSchema,
	waitlistAdminResendInviteInput,
	waitlistAdminUpdateStatusInput,
} from "@sonaraem/common/schemas";
import { sendWaitlistApprovedEmailTask } from "@sonaraem/common/trigger/tasks/emails/send-waitlist-approved";
import { db } from "@sonaraem/db";
import { user } from "@sonaraem/db/schema/auth";
import { waitlistSignup } from "@sonaraem/db/schema/waitlist-signup";
import { logger } from "@sonaraem/logger";
import { and, count, desc, eq, ilike, inArray, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { adminProcedure } from "../../procedures";

const RESEND_COOLDOWN_MS = 5 * 60 * 1000;

function generateInviteToken() {
	const raw = randomBytes(32).toString("hex");
	const hash = createHash("sha256").update(raw).digest("hex");
	const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
	return { raw, hash, expiresAt };
}

async function triggerApprovedEmailSafely(payload: {
	waitlistId: number;
	email: string;
}) {
	try {
		await sendWaitlistApprovedEmailTask.trigger(payload);
	} catch (error) {
		logger.warn(
			{ waitlistId: payload.waitlistId, error },
			"Failed to trigger waitlist approved email task — use resendInvite to retry",
		);
	}
}

export const adminWaitlistRouter = {
	list: adminProcedure
		.input(waitlistAdminListInput)
		.output(waitlistAdminListOutputSchema)
		.handler(async ({ input }) => {
			const { page, pageSize, status, q } = input;
			const offset = (page - 1) * pageSize;

			const where = and(
				status ? eq(waitlistSignup.status, status) : undefined,
				q ? ilike(waitlistSignup.email, `%${q}%`) : undefined,
			);

			const [items, totalRows] = await Promise.all([
				db
					.select({
						id: waitlistSignup.id,
						email: waitlistSignup.email,
						spotifyEmail: waitlistSignup.spotifyEmail,
						status: waitlistSignup.status,
						note: waitlistSignup.note,
						confirmationEmailSentAt: waitlistSignup.confirmationEmailSentAt,
						approvedAt: waitlistSignup.approvedAt,
						approvalEmailSentAt: waitlistSignup.approvalEmailSentAt,
						inviteRedeemedAt: waitlistSignup.inviteRedeemedAt,
						redeemedByEmail: user.email,
						createdAt: waitlistSignup.createdAt,
						updatedAt: waitlistSignup.updatedAt,
					})
					.from(waitlistSignup)
					.leftJoin(user, eq(waitlistSignup.inviteRedeemedByUserId, user.id))
					.where(where)
					.orderBy(desc(waitlistSignup.createdAt))
					.limit(pageSize)
					.offset(offset),
				db.select({ total: count() }).from(waitlistSignup).where(where),
			]);

			const total = totalRows[0]?.total ?? 0;

			return {
				items,
				total,
				page,
				pageSize,
				pageCount: Math.ceil(total / pageSize),
			};
		}),

	updateStatus: adminProcedure
		.input(waitlistAdminUpdateStatusInput)
		.output(z.object({ success: z.boolean() }))
		.handler(async ({ input }) => {
			const { id, status, note } = input;

			const [existing] = await db
				.select({ status: waitlistSignup.status })
				.from(waitlistSignup)
				.where(eq(waitlistSignup.id, id));

			if (!existing) {
				return { success: false };
			}

			if (status === existing.status) {
				if (note === undefined) {
					return { success: true };
				}
				await db
					.update(waitlistSignup)
					.set({ note, updatedAt: new Date() })
					.where(eq(waitlistSignup.id, id));
				return { success: true };
			}

			const token = status === "approved" ? generateInviteToken() : undefined;

			const [updated] = await db
				.update(waitlistSignup)
				.set({
					status,
					...(note !== undefined && { note }),
					approvedAt: status === "approved" ? new Date() : null,
					...(token
						? {
								inviteToken: token.hash,
								inviteTokenRaw: token.raw,
								inviteTokenExpiresAt: token.expiresAt,
								approvalEmailSentAt: null,
							}
						: {
								inviteToken: null,
								inviteTokenRaw: null,
								inviteTokenExpiresAt: null,
							}),
					updatedAt: new Date(),
				})
				.where(eq(waitlistSignup.id, id))
				.returning({ id: waitlistSignup.id, email: waitlistSignup.email });

			if (!updated) {
				return { success: false };
			}

			if (status === "approved") {
				await triggerApprovedEmailSafely({
					waitlistId: updated.id,
					email: updated.email,
				});
			}

			return { success: true };
		}),

	resendInvite: adminProcedure
		.input(waitlistAdminResendInviteInput)
		.output(z.object({ success: z.boolean() }))
		.handler(async ({ input }) => {
			const [row] = await db
				.select({
					id: waitlistSignup.id,
					email: waitlistSignup.email,
					status: waitlistSignup.status,
					inviteRedeemedAt: waitlistSignup.inviteRedeemedAt,
					approvalEmailSentAt: waitlistSignup.approvalEmailSentAt,
				})
				.from(waitlistSignup)
				.where(eq(waitlistSignup.id, input.id));

			if (!row) {
				return { success: false };
			}

			if (row.status !== "approved" || row.inviteRedeemedAt) {
				throw new ORPCError("BAD_REQUEST", {
					message:
						"Invite can only be resent for approved, unredeemed entries.",
				});
			}

			if (
				row.approvalEmailSentAt &&
				Date.now() - row.approvalEmailSentAt.getTime() < RESEND_COOLDOWN_MS
			) {
				throw new ORPCError("TOO_MANY_REQUESTS", {
					message: "Please wait a few minutes before resending the invite.",
				});
			}

			const token = generateInviteToken();

			const [updated] = await db
				.update(waitlistSignup)
				.set({
					inviteToken: token.hash,
					inviteTokenRaw: token.raw,
					inviteTokenExpiresAt: token.expiresAt,
					approvalEmailSentAt: null,
					updatedAt: new Date(),
				})
				.where(
					and(
						eq(waitlistSignup.id, input.id),
						eq(waitlistSignup.status, "approved"),
						isNull(waitlistSignup.inviteRedeemedAt),
					),
				)
				.returning({ id: waitlistSignup.id, email: waitlistSignup.email });

			if (!updated) {
				return { success: false };
			}

			await triggerApprovedEmailSafely({
				waitlistId: updated.id,
				email: updated.email,
			});

			return { success: true };
		}),

	bulkApprove: adminProcedure
		.input(waitlistAdminBulkIdsInput)
		.output(z.object({ approved: z.number() }))
		.handler(async ({ input }) => {
			const { ids } = input;

			const rows = await db
				.select({ id: waitlistSignup.id, email: waitlistSignup.email })
				.from(waitlistSignup)
				.where(
					and(
						inArray(waitlistSignup.id, ids),
						or(
							eq(waitlistSignup.status, "pending"),
							eq(waitlistSignup.status, "rejected"),
						),
					),
				);

			if (rows.length === 0) return { approved: 0 };

			await db.transaction(async (tx) => {
				for (const row of rows) {
					const token = generateInviteToken();
					await tx
						.update(waitlistSignup)
						.set({
							status: "approved",
							approvedAt: new Date(),
							inviteToken: token.hash,
							inviteTokenRaw: token.raw,
							inviteTokenExpiresAt: token.expiresAt,
							approvalEmailSentAt: null,
							updatedAt: new Date(),
						})
						.where(eq(waitlistSignup.id, row.id));
				}
			});

			try {
				await sendWaitlistApprovedEmailTask.batchTrigger(
					rows.map((row) => ({
						payload: { waitlistId: row.id, email: row.email },
					})),
				);
			} catch (error) {
				logger.warn(
					{ ids: rows.map((r) => r.id), error },
					"Failed to batch-trigger waitlist approved email tasks — use resendInvite to retry",
				);
			}

			return { approved: rows.length };
		}),

	bulkReject: adminProcedure
		.input(waitlistAdminBulkIdsInput)
		.output(z.object({ rejected: z.number() }))
		.handler(async ({ input }) => {
			const { ids } = input;

			const updated = await db
				.update(waitlistSignup)
				.set({
					status: "rejected",
					approvedAt: null,
					inviteToken: null,
					inviteTokenRaw: null,
					inviteTokenExpiresAt: null,
					updatedAt: new Date(),
				})
				.where(
					and(
						inArray(waitlistSignup.id, ids),
						or(
							eq(waitlistSignup.status, "pending"),
							eq(waitlistSignup.status, "approved"),
						),
					),
				)
				.returning({ id: waitlistSignup.id });

			return { rejected: updated.length };
		}),
};
