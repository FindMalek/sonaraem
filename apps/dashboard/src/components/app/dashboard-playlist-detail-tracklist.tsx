import { Skeleton } from "@sonaraem/ui";
import type { RefCallback } from "react";
import { DashboardPlaylistDetailSectionLabel } from "./dashboard-playlist-detail-section-label";
import type { DashboardPlaylistDetailTrackRowTrack } from "./dashboard-playlist-detail-track-row";
import { DashboardPlaylistDetailTrackRow } from "./dashboard-playlist-detail-track-row";

const TRACKLIST_SKELETON_KEYS = [
	"tl-sk-1",
	"tl-sk-2",
	"tl-sk-3",
	"tl-sk-4",
	"tl-sk-5",
	"tl-sk-6",
] as const;

export function DashboardPlaylistDetailTracklist({
	tracks,
	isLoading,
	hasNextPage,
	sentinelRef,
}: {
	tracks: DashboardPlaylistDetailTrackRowTrack[];
	isLoading: boolean;
	hasNextPage: boolean;
	sentinelRef: RefCallback<HTMLDivElement>;
}) {
	return (
		<section className="flex flex-col">
			<DashboardPlaylistDetailSectionLabel label="TRACKLIST" />
			{isLoading ? (
				TRACKLIST_SKELETON_KEYS.map((key) => (
					<Skeleton key={key} className="my-2 h-16 w-full" />
				))
			) : (
				<>
					{tracks.map((track, index) => (
						<DashboardPlaylistDetailTrackRow
							key={track.id}
							track={track}
							index={index}
						/>
					))}
					{tracks.length === 0 ? (
						<p className="py-4 text-muted-foreground text-sm">No tracks yet.</p>
					) : null}
				</>
			)}
			{hasNextPage ? <div ref={sentinelRef} className="h-1" /> : null}
		</section>
	);
}
