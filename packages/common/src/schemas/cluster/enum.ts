import { SUGGESTED_ARCHETYPE_VALUES } from "@sonaraem/db/schema/cluster";
import { z } from "zod";

export const suggestedArchetypeEnum = z.enum(SUGGESTED_ARCHETYPE_VALUES);
export type SuggestedArchetype = z.infer<typeof suggestedArchetypeEnum>;
