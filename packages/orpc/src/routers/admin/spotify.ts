import { ORPCError } from "@orpc/server";
import {
	emptyInput,
	spotifyAllowlistCheckOutputSchema,
	spotifyAllowlistHealthOutputSchema,
	spotifyOtpAdminListOutputSchema,
	spotifyOtpAdminSubmitInput,
} from "@sonaraem/common/schemas";
import {
	encryptSessionState,
	getAllowlistSessionHealth,
} from "@sonaraem/common/services/spotify-allowlist";
import { checkAllowlistSessionTask } from "@sonaraem/common/trigger/tasks/spotify-allowlist/manage-allowlist-entry";
import { db } from "@sonaraem/db";
import { spotifyOtpRequest } from "@sonaraem/db/schema/spotify-allowlist";
import { logger } from "@sonaraem/logger";
import { runs } from "@trigger.dev/sdk";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { adminProcedure } from "../../procedures";

// Encrypted at rest (AES-256-GCM, same cipher as the Playwright session state) as {ciphertext, iv, authTag} JSON packed into the single `code` column — nothing decrypts/clears it yet, tracked alongside the login-automation gap in #372.
function encryptOtpCode(code: string): string {
	return JSON.stringify(encryptSessionState(code));
}

export const adminSpotifyRouter = {
	health: {
		get: adminProcedure
			.input(emptyInput)
			.output(spotifyAllowlistHealthOutputSchema)
			.handler(async () => {
				return await getAllowlistSessionHealth();
			}),

		// Actually runs the browser check now, rather than just reading the last-recorded result — for "is this working right now" rather than "was this working last time someone signed up". triggerAndWait only works inside a task's own run(), so this is a plain admin route: trigger + poll instead.
		check: adminProcedure
			.input(emptyInput)
			.output(spotifyAllowlistCheckOutputSchema)
			.handler(async () => {
				const handle = await checkAllowlistSessionTask.trigger();
				const result = await runs.poll(handle);
				if (!result.isSuccess) {
					logger.warn(
						{ error: result.error },
						"Manual Spotify allowlist session check failed",
					);
					return { ok: false };
				}
				return result.output ?? { ok: true };
			}),
	},

	loginRelay: {
		list: adminProcedure
			.output(spotifyOtpAdminListOutputSchema)
			.handler(async () => {
				const items = await db
					.select({
						id: spotifyOtpRequest.id,
						requestedAt: spotifyOtpRequest.requestedAt,
						submittedAt: spotifyOtpRequest.submittedAt,
						status: spotifyOtpRequest.status,
					})
					.from(spotifyOtpRequest)
					.orderBy(desc(spotifyOtpRequest.requestedAt))
					.limit(20);

				return { items };
			}),

		submit: adminProcedure
			.input(spotifyOtpAdminSubmitInput)
			.output(z.object({ success: z.boolean() }))
			.handler(async ({ input }) => {
				const [updated] = await db
					.update(spotifyOtpRequest)
					.set({
						code: encryptOtpCode(input.code),
						submittedAt: new Date(),
						status: "submitted",
					})
					.where(
						and(
							eq(spotifyOtpRequest.id, input.id),
							eq(spotifyOtpRequest.status, "pending"),
						),
					)
					.returning({ id: spotifyOtpRequest.id });

				if (!updated) {
					throw new ORPCError("BAD_REQUEST", {
						message:
							"This request is no longer pending — it may have already been submitted, expired, or failed.",
					});
				}

				return { success: true };
			}),
	},
};
