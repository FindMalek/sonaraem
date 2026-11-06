import { orpc } from "./orpc";

export const queryKeys = {
	clusters: () => orpc.clusters.key(),
	playlists: () => orpc.playlists.key(),
	tracks: () => orpc.tracks.key(),
	pipeline: () => orpc.pipeline.key(),
	emailPreferences: () => orpc.emailPreferences.key(),
	hasSpotifyLinked: () => orpc.hasSpotifyLinked.key(),
	spotifyLibraryStats: () => orpc.spotify.libraryStats.key(),
	insightsSummary: () => orpc.insights.summary.key(),
	billing: () => orpc.billing.key(),
} as const;
