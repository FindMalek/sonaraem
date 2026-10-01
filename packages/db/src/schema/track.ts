import {
	boolean,
	index,
	integer,
	jsonb,
	pgTable,
	primaryKey,
	real,
	text,
	timestamp,
	vector,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { genreDomain } from "./genre-domain";

// Column stays plain text (not pgEnum) to keep migrations cheap — see pipeline-run.ts. @sonaraem/common derives its Zod enum from these values.
export const LYRICS_STATUS_VALUES = [
	"pending",
	"found",
	"not_found",
	"error",
] as const;
export type LyricsStatus = (typeof LYRICS_STATUS_VALUES)[number];

export const track = pgTable(
	"track",
	{
		// Identity
		id: text("id").primaryKey(), // Spotify track ID
		spotifyUri: text("spotify_uri").notNull(),

		// Core metadata (Spotify)
		name: text("name").notNull(),
		artistNames: text("artist_names").notNull(), // JSON array as text string
		artistIds: jsonb("artist_ids").$type<Array<string | null>>(), // Parallel to artistNames, same order; null where Spotify has no ID for that artist
		albumName: text("album_name"),
		albumId: text("album_id"),
		albumImageUrl: text("album_image_url"),
		releaseDate: text("release_date"), // ISO 8601 date string as returned by Spotify
		explicit: boolean("explicit"),
		popularity: integer("popularity"), // 0-100
		durationMs: integer("duration_ms"),
		spotifyGenres: jsonb("spotify_genres").$type<string[]>(), // Raw artist genres

		// Genre domain (our classifier output)
		genreDomainId: integer("genre_domain_id").references(() => genreDomain.id),

		// Spotify audio features (all 10)
		valence: real("valence"),
		energy: real("energy"),
		danceability: real("danceability"),
		tempo: real("tempo"),
		acousticness: real("acousticness"),
		instrumentalness: real("instrumentalness"),
		speechiness: real("speechiness"),
		liveness: real("liveness"),
		key: integer("key"),
		mode: integer("mode"),

		// Lyrics (LRCLib)
		lyrics: text("lyrics"),
		syncedLyrics: text("synced_lyrics"),
		lyricsInstrumental: boolean("lyrics_instrumental"),
		lrclibId: integer("lrclib_id"),
		lyricsFetchedAt: timestamp("lyrics_fetched_at"),
		lyricsStatus: text("lyrics_status").$type<LyricsStatus>(),

		// LLM classification output lives in track_analysis (#113) — see
		// llmFieldsFromAnalysis for the read-side shape reconstruction.

		// Embedding (OpenAI)
		embedding: vector("embedding", { dimensions: 1536 }),
		embeddingGeneratedAt: timestamp("embedding_generated_at"),
		embeddingInput: text("embedding_input"), // What we sent (for debugging)

		// Domain assignment
		domainAssignedAt: timestamp("domain_assigned_at"),

		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		index("track_genre_domain_id_idx").on(table.genreDomainId),
		index("track_lyrics_status_idx").on(table.lyricsStatus),
		index("track_embedding_idx").using(
			"hnsw",
			table.embedding.op("vector_cosine_ops"),
		),
	],
);

export const userTracks = pgTable(
	"user_tracks",
	{
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		trackId: text("track_id")
			.notNull()
			.references(() => track.id, { onDelete: "cascade" }),
		addedAt: timestamp("added_at").defaultNow().notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.userId, table.trackId] }),
		index("user_tracks_user_id_idx").on(table.userId),
		index("user_tracks_track_id_idx").on(table.trackId),
	],
);
