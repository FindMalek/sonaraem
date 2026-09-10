import { z } from "zod";

export const spotifyAllowlistHealthOutputSchema = z.object({
	hasSession: z.boolean(),
	lastWriteAt: z.date().nullable(),
	lastCheckedAt: z.date().nullable(),
	lastError: z.string().nullable(),
});
export type SpotifyAllowlistHealthOutput = z.infer<
	typeof spotifyAllowlistHealthOutputSchema
>;

export const spotifyAllowlistCheckOutputSchema = z.object({
	ok: z.boolean(),
});
export type SpotifyAllowlistCheckOutput = z.infer<
	typeof spotifyAllowlistCheckOutputSchema
>;
