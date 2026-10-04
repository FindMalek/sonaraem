import {
	index,
	integer,
	jsonb,
	pgTable,
	primaryKey,
	real,
	serial,
	text,
	timestamp,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { genreDomain } from "./genre-domain";
import { track } from "./track";

export const SUGGESTED_ARCHETYPE_VALUES = [
	"mood",
	"situation",
	"genre",
	"hybrid",
] as const;
export type SuggestedArchetype = (typeof SUGGESTED_ARCHETYPE_VALUES)[number];

export type ClusterMeta = {
	themeSummary: string;
	dominantMood: string;
	dominantEnergy: string;
	topThemes: string[];
	topVibes: string[];
	suggestedArchetype: SuggestedArchetype;
};

export const cluster = pgTable(
	"cluster",
	{
		id: serial("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		genreDomainId: integer("genre_domain_id")
			.notNull()
			.references(() => genreDomain.id),
		centroid: jsonb("centroid").$type<number[]>(),
		size: integer("size").notNull(),
		avgValence: real("avg_valence"),
		avgEnergy: real("avg_energy"),
		avgTempo: real("avg_tempo"),
		metadata: jsonb("metadata").$type<ClusterMeta>(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [index("cluster_user_id_idx").on(table.userId)],
);

export const clusterTracks = pgTable(
	"cluster_tracks",
	{
		clusterId: integer("cluster_id")
			.notNull()
			.references(() => cluster.id, { onDelete: "cascade" }),
		trackId: text("track_id")
			.notNull()
			.references(() => track.id, { onDelete: "cascade" }),
		position: integer("position"),
	},
	(table) => [primaryKey({ columns: [table.clusterId, table.trackId] })],
);
