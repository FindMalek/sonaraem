import { z } from "zod";

export const spotifyAllowlistModule = {
	server: {
		SONARAEM_SPOTIFY_ALLOWLIST_SESSION_KEY: z.string().min(1).optional(),
		// The 5th Dev Mode slot — reserved for admin access, never allocated via
		// the slot table (#290). The reconcile sweep must never remove it.
		SONARAEM_SPOTIFY_ALLOWLIST_ADMIN_EMAIL: z.string().email(),
	},
} as const;
