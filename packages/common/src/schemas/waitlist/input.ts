import { z } from "zod";

export const waitlistSignupInput = z.object({
	email: z.string().trim().email(),
	// Optional — defaults to `email` server-side when omitted. The frontend
	// always keeps this in sync while its "same as above" checkbox is
	// checked, but the API itself shouldn't depend on a specific client
	// doing that; most signups genuinely use the same email for both.
	spotifyEmail: z.string().trim().email().optional(),
	// Honeypot: real users never fill this in. Bots that auto-fill all fields will.
	website: z.string().optional(),
});
export type WaitlistSignupInput = z.infer<typeof waitlistSignupInput>;

export const waitlistStatusInput = z.object({
	token: z.string().min(1),
});
export type WaitlistStatusInput = z.infer<typeof waitlistStatusInput>;

export const spotifyAuthFailureInput = z.object({
	// Raw sonaraem_invite cookie value — resolves which waitlist signup this was.
	inviteToken: z
		.string()
		.regex(/^[0-9a-f]{64}$/)
		.optional(),
	error: z.string().min(1).max(200),
	errorDescription: z.string().max(500).optional(),
});
export type SpotifyAuthFailureInput = z.infer<typeof spotifyAuthFailureInput>;
