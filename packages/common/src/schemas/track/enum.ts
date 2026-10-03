import { LYRICS_STATUS_VALUES } from "@sonaraem/db/schema/track";
import { z } from "zod";

export const lyricsStatusEnum = z.enum(LYRICS_STATUS_VALUES);
export type LyricsStatus = z.infer<typeof lyricsStatusEnum>;
