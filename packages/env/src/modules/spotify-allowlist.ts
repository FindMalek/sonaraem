import { z } from "zod";

export const spotifyAllowlistModule = {
	server: {
		SONARAEM_SPOTIFY_ALLOWLIST_SESSION_KEY: z.string().min(1).optional(),
		// No longer read at runtime since #392/#394 dropped the reclaim sweep — kept optional so it can still document which email owns the 5th, admin-reserved Dev Mode seat.
		SONARAEM_SPOTIFY_ALLOWLIST_ADMIN_EMAIL: z.email().optional(),
	},
} as const;
