import { z } from "zod";

import { waitlistStatusEnum } from "../waitlist/enum";

export const waitlistAdminListInput = z.object({
	page: z.number().int().min(1).default(1),
	pageSize: z.number().int().min(1).max(100).default(25),
	status: waitlistStatusEnum.optional(),
	q: z.string().optional(),
});
export type WaitlistAdminListInput = z.infer<typeof waitlistAdminListInput>;

export const waitlistAdminItemSchema = z.object({
	id: z.number().int(),
	email: z.string(),
	spotifyEmail: z.string().nullable(),
	status: waitlistStatusEnum,
	note: z.string().nullable(),
	confirmationEmailSentAt: z.date().nullable(),
	approvedAt: z.date().nullable(),
	approvalEmailSentAt: z.date().nullable(),
	inviteRedeemedAt: z.date().nullable(),
	// The actual Spotify-authenticated account that claimed this invite —
	// surfaced so admins can audit "did the right person get in," since the
	// waitlist email and the Spotify account email aren't required to match.
	redeemedByEmail: z.string().nullable(),
	createdAt: z.date(),
	updatedAt: z.date(),
});
export type WaitlistAdminItem = z.infer<typeof waitlistAdminItemSchema>;

export const waitlistAdminListOutputSchema = z.object({
	items: z.array(waitlistAdminItemSchema),
	total: z.number().int().min(0),
	page: z.number().int().min(1),
	pageSize: z.number().int().min(1),
	pageCount: z.number().int().min(0),
});
export type WaitlistAdminListOutput = z.infer<
	typeof waitlistAdminListOutputSchema
>;

export const waitlistAdminUpdateStatusInput = z.object({
	id: z.number().int(),
	status: waitlistStatusEnum,
	note: z.string().optional(),
});
export type WaitlistAdminUpdateStatusInput = z.infer<
	typeof waitlistAdminUpdateStatusInput
>;

export const waitlistAdminBulkIdsInput = z.object({
	ids: z.array(z.number().int()).min(1),
});
export type WaitlistAdminBulkIdsInput = z.infer<
	typeof waitlistAdminBulkIdsInput
>;

export const waitlistAdminResendInviteInput = z.object({
	id: z.number().int(),
});
export type WaitlistAdminResendInviteInput = z.infer<
	typeof waitlistAdminResendInviteInput
>;
