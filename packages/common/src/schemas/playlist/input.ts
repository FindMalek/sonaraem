import { z } from "zod";

export const playlistGetByIdInput = z.object({
	id: z.number(),
});
export type PlaylistGetByIdInput = z.infer<typeof playlistGetByIdInput>;

// "default" keeps Sonaraem's algorithmic energy-arc ordering (playlistTracks.position).
export const playlistTrackSortEnum = z.enum(["default", "name", "duration"]);
export type PlaylistTrackSort = z.infer<typeof playlistTrackSortEnum>;

export const playlistTracksInput = z.object({
	playlistId: z.number(),
	cursor: z.number().nullish(),
	limit: z.number().int().min(1).max(100).default(50),
	search: z.string().optional(),
	sort: playlistTrackSortEnum.default("default"),
});
export type PlaylistTracksInput = z.infer<typeof playlistTracksInput>;

// "recent" keeps the existing newest-created-first ordering.
export const playlistSortEnum = z.enum(["recent", "name", "trackCount"]);
export type PlaylistSort = z.infer<typeof playlistSortEnum>;

export const playlistListInput = z.object({
	cursor: z.number().nullish(),
	limit: z.number().int().min(1).max(50).default(20),
	search: z.string().optional(),
	sort: playlistSortEnum.default("recent"),
	tags: z.array(z.string()).optional(),
});
export type PlaylistListInput = z.infer<typeof playlistListInput>;

export const playlistUpdateInput = z.object({
	id: z.number(),
	name: z.string().optional(),
	description: z.string().optional(),
	autoSyncEnabled: z.boolean().optional(),
});
export type PlaylistUpdateInput = z.infer<typeof playlistUpdateInput>;

export const playlistExportInput = z.object({
	id: z.number(),
});
export type PlaylistExportInput = z.infer<typeof playlistExportInput>;
