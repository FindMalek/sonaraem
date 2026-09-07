import { adminCostsRouter } from "./costs";
import { adminFeedbackRouter } from "./feedback";
import { adminSetupRouter } from "./setup";
import { adminSpotifyAllowlistQueueRouter } from "./spotify-allowlist-queue";
import { adminSpotifyLoginRelayRouter } from "./spotify-login-relay";
import { adminStatsRouter } from "./stats";
import { adminUsersRouter } from "./users";
import { adminWaitlistRouter } from "./waitlist";

export const adminRouter = {
	stats: adminStatsRouter,
	waitlist: adminWaitlistRouter,
	feedback: adminFeedbackRouter,
	users: adminUsersRouter,
	costs: adminCostsRouter,
	setup: adminSetupRouter,
	spotifyLoginRelay: adminSpotifyLoginRelayRouter,
	spotifyAllowlistQueue: adminSpotifyAllowlistQueueRouter,
};

export type AdminRouter = typeof adminRouter;
