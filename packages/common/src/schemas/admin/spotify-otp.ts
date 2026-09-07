import { z } from "zod";

export const spotifyOtpRequestStatusEnum = z.enum([
	"pending",
	"submitted",
	"consumed",
	"expired",
	"failed",
]);
export type SpotifyOtpRequestStatus = z.infer<
	typeof spotifyOtpRequestStatusEnum
>;

export const spotifyOtpAdminItemSchema = z.object({
	id: z.number().int(),
	requestedAt: z.date(),
	submittedAt: z.date().nullable(),
	status: spotifyOtpRequestStatusEnum,
});
export type SpotifyOtpAdminItem = z.infer<typeof spotifyOtpAdminItemSchema>;

export const spotifyOtpAdminListOutputSchema = z.object({
	items: z.array(spotifyOtpAdminItemSchema),
});
export type SpotifyOtpAdminListOutput = z.infer<
	typeof spotifyOtpAdminListOutputSchema
>;

export const spotifyOtpAdminSubmitInput = z.object({
	id: z.number().int(),
	code: z.string().trim().min(1).max(32),
});
export type SpotifyOtpAdminSubmitInput = z.infer<
	typeof spotifyOtpAdminSubmitInput
>;
