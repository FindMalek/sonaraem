import { LYRICS_STATUS_VALUES } from "@sonaraem/db/schema/track";
import { z } from "zod";

export type { LyricsStatus } from "@sonaraem/db/schema/track";
export { LYRICS_STATUS_VALUES } from "@sonaraem/db/schema/track";

export const lyricsStatusEnum = z.enum(LYRICS_STATUS_VALUES);
