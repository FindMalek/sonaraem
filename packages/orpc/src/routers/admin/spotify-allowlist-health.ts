import {
	emptyInput,
	spotifyAllowlistCheckOutputSchema,
	spotifyAllowlistHealthOutputSchema,
} from "@sonaraem/common/schemas";
import { getAllowlistSessionHealth } from "@sonaraem/common/services/spotify-allowlist";
import { checkAllowlistSessionTask } from "@sonaraem/common/trigger/tasks/spotify-allowlist/manage-allowlist-entry";
import { logger } from "@sonaraem/logger";
import { adminProcedure } from "../../procedures";

export const adminSpotifyAllowlistHealthRouter = {
	get: adminProcedure
		.input(emptyInput)
		.output(spotifyAllowlistHealthOutputSchema)
		.handler(async () => {
			return await getAllowlistSessionHealth();
		}),

	// Actually runs the browser check now, rather than just reading the last-recorded result — for "is this working right now" rather than "was this working last time someone signed up".
	check: adminProcedure
		.input(emptyInput)
		.output(spotifyAllowlistCheckOutputSchema)
		.handler(async () => {
			const result = await checkAllowlistSessionTask.triggerAndWait();
			if (!result.ok) {
				logger.warn(
					{ error: result.error },
					"Manual Spotify allowlist session check failed",
				);
				return { ok: false };
			}
			return result.output;
		}),
};
