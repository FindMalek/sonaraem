import { ORPCError } from "@orpc/server";
import {
	spotifyOtpAdminListOutputSchema,
	spotifyOtpAdminSubmitInput,
} from "@sonaraem/common/schemas";
import { encryptSessionState } from "@sonaraem/common/services/spotify-allowlist";
import { db } from "@sonaraem/db";
import { spotifyOtpRequest } from "@sonaraem/db/schema/spotify-allowlist";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { adminProcedure } from "../../procedures";

// Encrypted at rest (AES-256-GCM, same key/cipher as the Playwright session
// state) since this is a live Spotify account login code — the {ciphertext,
// iv, authTag} payload is packed as JSON into the single `code` column.
// Note: nothing decrypts or clears this yet — the OTP-consumption side
// (reading a submitted code, marking it consumed/expired, clearing it after)
// isn't built, tracked alongside the same login-automation gap as #372.
function encryptOtpCode(code: string): string {
	return JSON.stringify(encryptSessionState(code));
}

export const adminSpotifyLoginRelayRouter = {
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
};
