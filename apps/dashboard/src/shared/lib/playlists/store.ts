import type {
	PlaylistListInput,
	PlaylistSort,
	PlaylistTrackSort,
} from "@sonaraem/common/schemas";
import { create } from "zustand";

type PlaylistsFilters = Required<Pick<PlaylistListInput, "tags">>;

const EMPTY_FILTERS: PlaylistsFilters = { tags: [] };

interface PlaylistsStore {
	selectedPlaylistId: number | null;
	setSelectedPlaylist: (id: number | null) => void;
	/** Search within the currently-viewed playlist's own tracklist (playlist/[id]), not the playlists list. */
	trackSearch: string;
	setTrackSearch: (value: string) => void;
	/** Sort for the /playlists list. */
	sort: PlaylistSort;
	setSort: (value: PlaylistSort) => void;
	/** Filters for the /playlists list. */
	filters: PlaylistsFilters;
	toggleTagFilter: (tag: string) => void;
	clearFilters: () => void;
	/** Sort for the currently-viewed playlist's own tracklist. */
	trackSort: PlaylistTrackSort;
	setTrackSort: (value: PlaylistTrackSort) => void;
}

export const usePlaylistsStore = create<PlaylistsStore>((set) => ({
	selectedPlaylistId: null,
	setSelectedPlaylist: (id) => set({ selectedPlaylistId: id }),
	trackSearch: "",
	setTrackSearch: (value) => set({ trackSearch: value }),
	sort: "recent",
	setSort: (value) => set({ sort: value }),
	filters: EMPTY_FILTERS,
	toggleTagFilter: (tag) =>
		set(({ filters }) => ({
			filters: {
				...filters,
				tags: filters.tags.includes(tag)
					? filters.tags.filter((selected) => selected !== tag)
					: [...filters.tags, tag],
			},
		})),
	clearFilters: () => set({ filters: EMPTY_FILTERS }),
	trackSort: "default",
	setTrackSort: (value) => set({ trackSort: value }),
}));
