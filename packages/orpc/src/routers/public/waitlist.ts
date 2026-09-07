import {
	waitlistSignupInput,
	waitlistSignupOutputSchema,
	waitlistStatusInput,
	waitlistStatusOutputSchema,
} from "@sonaraem/common/schemas";
import { sendWaitlistConfirmationEmailTask } from "@sonaraem/common/trigger/tasks/emails/send-waitlist-confirmation";
import { verifyWaitlistStatusToken } from "@sonaraem/common/utils/waitlist-token";
import { db } from "@sonaraem/db";
import { waitlistSignup } from "@sonaraem/db/schema/waitlist-signup";
import { logger } from "@sonaraem/logger";
import { and, count, eq, isNull, lt } from "drizzle-orm";

import { publicProcedure } from "../../procedures";

export const waitlistRouter = {
	signup: publicProcedure
		.meta({
			openapi: {
				method: "POST",
				path: "/waitlist/signup",
				summary: "Join the waitlist",
				tags: ["waitlist"],
			},
		})
		.input(waitlistSignupInput)
		.output(waitlistSignupOutputSchema)
		.handler(async ({ input }) => {
			// Honeypot tripped: pretend success, do nothing.
			if (input.website) {
				return { success: true };
			}

			const email = input.email.toLowerCase().trim();
			const spotifyEmail = input.spotifyEmail.toLowerCase().trim();
			const [inserted] = await db
				.insert(waitlistSignup)
				.values({ email, spotifyEmail })
				.onConflictDoNothing({ target: waitlistSignup.email })
				.returning({ id: waitlistSignup.id });

			let waitlistId = inserted?.id ?? null;

			// If the insert was a no-op (duplicate email), check whether the
			// confirmation email was never sent — this recovers signups where the
			// initial trigger() call failed after the row was created.
			if (!waitlistId) {
				const [existing] = await db
					.select({
						id: waitlistSignup.id,
						confirmationEmailSentAt: waitlistSignup.confirmationEmailSentAt,
					})
					.from(waitlistSignup)
					.where(
						and(
							eq(waitlistSignup.email, email),
							isNull(waitlistSignup.confirmationEmailSentAt),
						),
					);
				waitlistId = existing?.id ?? null;
			}

			if (waitlistId !== null) {
				await sendWaitlistConfirmationEmailTask.trigger({
					waitlistId,
					email,
				});
				if (inserted) {
					logger.info({ waitlistId }, "Waitlist signup received");
				}
			}

			return { success: true };
		}),

	status: publicProcedure
		.meta({
			openapi: {
				method: "GET",
				path: "/waitlist/status",
				summary: "Check waitlist status by signed token",
				tags: ["waitlist"],
			},
		})
		.input(waitlistStatusInput)
		.output(waitlistStatusOutputSchema)
		.handler(async ({ input }) => {
			const verified = verifyWaitlistStatusToken(input.token);
			if (!verified) {
				return { status: null, queuePosition: null };
			}

			const email = verified.email;
			const [row] = await db
				.select({
					status: waitlistSignup.status,
					createdAt: waitlistSignup.createdAt,
				})
				.from(waitlistSignup)
				.where(eq(waitlistSignup.email, email));

			if (!row) {
				return { status: null, queuePosition: null };
			}

			if (row.status !== "pending") {
				return { status: row.status, queuePosition: null };
			}

			const aheadRows = await db
				.select({ ahead: count() })
				.from(waitlistSignup)
				.where(
					and(
						eq(waitlistSignup.status, "pending"),
						lt(waitlistSignup.createdAt, row.createdAt),
					),
				);

			return {
				status: row.status,
				queuePosition: (aheadRows[0]?.ahead ?? 0) + 1,
			};
		}),
};
