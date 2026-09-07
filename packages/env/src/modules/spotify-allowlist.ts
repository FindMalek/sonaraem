import { z } from "zod";

export const spotifyAllowlistModule = {
	server: {
		SONARAEM_SPOTIFY_ALLOWLIST_SESSION_KEY: z.string().min(1).optional(),
		SONARAEM_SPOTIFY_ALLOWLIST_ADMIN_EMAIL: z.email(),
	},
} as const;
