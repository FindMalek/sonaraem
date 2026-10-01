import {
	boolean,
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
import { cluster } from "./cluster";
import { genreDomain } from "./genre-domain";
import { track } from "./track";

// Column stays plain text (not pgEnum) to keep migrations cheap — see pipeline-run.ts. @sonaraem/common derives its Zod enum from these values.
export const TAXONOMY_VALUES = [
	"mood",
	"situation",
	"genre",
	"hybrid",
] as const;
export type Taxonomy = (typeof TAXONOMY_VALUES)[number];

export const playlist = pgTable(
	"playlist",
	{
		id: serial("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		aiGeneratedName: text("ai_generated_name"),
		description: text("description"),
		theme: text("theme"),
		taxonomy: text("taxonomy").$type<Taxonomy>(),
		genreDomainId: integer("genre_domain_id").references(() => genreDomain.id),
		energyCurve: jsonb("energy_curve").$type<number[]>(),
		coverColor: text("cover_color"),
		tags: text("tags").array(),
		trackCount: integer("track_count").default(0).notNull(),
		isGenerated: boolean("is_generated").default(false).notNull(),
		spotifyPlaylistId: text("spotify_playlist_id"),
		exportedAt: timestamp("exported_at"),
		// Default true: opt-out, not opt-in — existing exported playlists keep auto-updating (#166).
		autoSyncEnabled: boolean("auto_sync_enabled").default(true).notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		index("playlist_user_id_idx").on(table.userId),
		index("playlist_taxonomy_idx").on(table.taxonomy),
	],
);

export const playlistClusters = pgTable(
	"playlist_clusters",
	{
		playlistId: integer("playlist_id")
			.notNull()
			.references(() => playlist.id, { onDelete: "cascade" }),
		clusterId: integer("cluster_id")
			.notNull()
			.references(() => cluster.id, { onDelete: "cascade" }),
		position: integer("position"),
		weight: real("weight"),
	},
	(table) => [primaryKey({ columns: [table.playlistId, table.clusterId] })],
);

export const playlistTracks = pgTable(
	"playlist_tracks",
	{
		playlistId: integer("playlist_id")
			.notNull()
			.references(() => playlist.id, { onDelete: "cascade" }),
		trackId: text("track_id")
			.notNull()
			.references(() => track.id, { onDelete: "cascade" }),
		position: integer("position").notNull(),
	},
	(table) => [primaryKey({ columns: [table.playlistId, table.trackId] })],
);
