import { TAXONOMY_VALUES } from "@sonaraem/db/schema/playlist";
import { z } from "zod";

export type { Taxonomy } from "@sonaraem/db/schema/playlist";
export { TAXONOMY_VALUES } from "@sonaraem/db/schema/playlist";

export const taxonomyEnum = z.enum(TAXONOMY_VALUES);
