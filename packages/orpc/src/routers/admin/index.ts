import { adminCostsRouter } from "./costs";
import { adminFeedbackRouter } from "./feedback";
import { adminSetupRouter } from "./setup";
import { adminSpotifyRouter } from "./spotify";
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
	spotify: adminSpotifyRouter,
};

export type AdminRouter = typeof adminRouter;
