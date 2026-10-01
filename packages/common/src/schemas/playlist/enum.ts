import { TAXONOMY_VALUES } from "@sonaraem/db/schema/playlist";
import { z } from "zod";

export const taxonomyEnum = z.enum(TAXONOMY_VALUES);
export type Taxonomy = z.infer<typeof taxonomyEnum>;
