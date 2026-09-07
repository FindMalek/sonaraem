import { z } from "zod";

export const adminUserListInput = z.object({
	page: z.number().int().min(1).default(1),
	pageSize: z.number().int().min(1).max(100).default(25),
	q: z.string().optional(),
});
export type AdminUserListInput = z.infer<typeof adminUserListInput>;

export const adminUserItemSchema = z.object({
	id: z.string(),
	name: z.string(),
	email: z.string(),
	emailVerified: z.boolean(),
	role: z.string().nullable(),
	isApproved: z.boolean(),
	banned: z.boolean(),
	createdAt: z.date(),
});
export type AdminUserItem = z.infer<typeof adminUserItemSchema>;

export const adminUserListOutputSchema = z.object({
	items: z.array(adminUserItemSchema),
	total: z.number().int().min(0),
	page: z.number().int().min(1),
	pageSize: z.number().int().min(1),
	pageCount: z.number().int().min(0),
});
export type AdminUserListOutput = z.infer<typeof adminUserListOutputSchema>;

export const adminUserDeleteInput = z.object({
	id: z.string(),
});
export type AdminUserDeleteInput = z.infer<typeof adminUserDeleteInput>;
