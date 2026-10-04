import { SUGGESTED_ARCHETYPE_VALUES } from "@sonaraem/db/schema/cluster";
import { z } from "zod";

export type { SuggestedArchetype } from "@sonaraem/db/schema/cluster";
export { SUGGESTED_ARCHETYPE_VALUES } from "@sonaraem/db/schema/cluster";

export const suggestedArchetypeEnum = z.enum(SUGGESTED_ARCHETYPE_VALUES);
