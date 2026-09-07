import { z } from "zod";

export const allowlistSlotStatusEnum = z.enum([
	"available",
	"occupied",
	"reclaiming",
]);
export type AllowlistSlotStatus = z.infer<typeof allowlistSlotStatusEnum>;

export const allowlistSlotKindEnum = z.enum(["rotation", "login"]);
export type AllowlistSlotKind = z.infer<typeof allowlistSlotKindEnum>;

export const allowlistQueueStatusEnum = z.enum([
	"waiting",
	"active",
	"done",
	"failed",
	"cancelled",
]);
export type AllowlistQueueStatus = z.infer<typeof allowlistQueueStatusEnum>;

export const allowlistQueuePriorityEnum = z.enum(["login", "manual", "cron"]);
export type AllowlistQueuePriority = z.infer<typeof allowlistQueuePriorityEnum>;

export const allowlistSlotAdminItemSchema = z.object({
	id: z.number().int(),
	kind: allowlistSlotKindEnum,
	status: allowlistSlotStatusEnum,
	email: z.string().nullable(),
	occupiedAt: z.date().nullable(),
	releasedAt: z.date().nullable(),
});
export type AllowlistSlotAdminItem = z.infer<
	typeof allowlistSlotAdminItemSchema
>;

export const allowlistQueueAdminItemSchema = z.object({
	id: z.number().int(),
	// Human-readable identity — the user's name/email once they have an
	// account, or the pre-OAuth waitlist email otherwise.
	identityLabel: z.string(),
	priority: allowlistQueuePriorityEnum,
	status: allowlistQueueStatusEnum,
	email: z.string().nullable(),
	requestedAt: z.date(),
	activatedAt: z.date().nullable(),
	completedAt: z.date().nullable(),
	error: z.string().nullable(),
});
export type AllowlistQueueAdminItem = z.infer<
	typeof allowlistQueueAdminItemSchema
>;

export const allowlistQueueAdminOutputSchema = z.object({
	slots: z.array(allowlistSlotAdminItemSchema),
	requests: z.array(allowlistQueueAdminItemSchema),
});
export type AllowlistQueueAdminOutput = z.infer<
	typeof allowlistQueueAdminOutputSchema
>;
