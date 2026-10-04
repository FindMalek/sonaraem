import { z } from "zod";
import { lyricsStatusEnum } from "./enum";

// "album" orders by albumName (then id for stable pagination), letting the UI
// render contiguous album groups instead of an interleaved recent-first feed.
export const tracksListSortEnum = z.enum(["recent", "album"]);
export type TracksListSort = z.infer<typeof tracksListSortEnum>;

export const tracksListInput = z.object({
	page: z.number().default(1),
	pageSize: z.number().default(50),
	search: z.string().optional(),
	lyricsStatus: lyricsStatusEnum.optional(),
	classified: z.boolean().optional(),
	embedded: z.boolean().optional(),
	sort: tracksListSortEnum.default("recent"),
});
export type TracksListInput = z.infer<typeof tracksListInput>;

export const trackGetByIdInput = z.object({
	id: z.string(),
});
export type TrackGetByIdInput = z.infer<typeof trackGetByIdInput>;
