"use client";

import { DASHBOARD_ROUTES } from "@sonaraem/common/utils/routes";
import { Icons } from "@sonaraem/ui";
import {
	DashboardPlaylistsListRow,
	DashboardPlaylistsListSkeleton,
} from "@/components/app/dashboard-playlists-list-row";
import { DashboardPlaylistsPageHeader } from "@/components/app/dashboard-playlists-page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { ScrollToTopButton } from "@/components/shared/scroll-to-top-button";
import { useDashboardScrollContainer } from "@/hooks/use-dashboard-scroll-container";
import { useInfiniteScrollSentinel } from "@/hooks/use-infinite-scroll-sentinel";
import { useScrollFlags } from "@/hooks/use-scroll-flags";
import { cn } from "@/lib/utils";
import { usePlaylistsController } from "@/shared/lib/playlists/controller.hook";

export default function PlaylistsPage() {
	const { list, filters, clearFilters } = usePlaylistsController();
	const {
		data,
		isLoading,
		isError,
		error,
		refetch,
		fetchNextPage,
		hasNextPage,
		isFetchingNextPage,
		isPlaceholderData,
	} = list;

	const scrollContainerRef = useDashboardScrollContainer();
	const { showBackToTop, scrollDirection } = useScrollFlags(
		scrollContainerRef,
		{ collapseAt: 24, backToTopAt: 400 },
	);

	const sentinelRef = useInfiniteScrollSentinel({
		rootRef: scrollContainerRef,
		hasNextPage,
		isFetchingNextPage,
		fetchNextPage,
	});

	const playlists = data?.pages.flatMap((page) => page.items) ?? [];
	const hasActiveFilters = filters.tags.length > 0;

	if (isError) {
		return (
			<div className="space-y-8">
				<DashboardPlaylistsPageHeader hasPlaylists={hasActiveFilters} />
				<ErrorState
					message={
						error instanceof Error ? error.message : "Failed to load playlists"
					}
					onRetry={() => refetch()}
				/>
			</div>
		);
	}

	if (isLoading) {
		return (
			<div className="space-y-8">
				<DashboardPlaylistsPageHeader hasPlaylists={false} />
				<DashboardPlaylistsListSkeleton />
			</div>
		);
	}

	return (
		<div className="space-y-8">
			<DashboardPlaylistsPageHeader
				hasPlaylists={playlists.length > 0 || hasActiveFilters}
			/>

			{playlists.length > 0 ? (
				<div
					aria-busy={isPlaceholderData}
					className={cn(
						"divide-y divide-border transition-opacity",
						isPlaceholderData && "opacity-60",
					)}
				>
					{playlists.map((pl) => (
						<DashboardPlaylistsListRow key={pl.id} playlist={pl} />
					))}
				</div>
			) : hasActiveFilters ? (
				<EmptyState
					icon={Icons.filter}
					title="No matching playlists"
					description="Try different tags."
					action={{ label: "Clear filters", onClick: clearFilters }}
					variant="card"
				/>
			) : (
				<EmptyState
					icon={Icons.disc}
					title="No playlists yet"
					description="Run the pipeline to generate playlists from your library."
					action={{
						label: "Run Pipeline",
						onClick: () => {
							window.location.href = DASHBOARD_ROUTES.overview.path;
						},
					}}
					variant="card"
				/>
			)}

			{hasNextPage && !isPlaceholderData ? (
				<div ref={sentinelRef} className="h-1" />
			) : null}

			<ScrollToTopButton
				visible={showBackToTop}
				scrollDirection={scrollDirection}
				containerRef={scrollContainerRef}
			/>
		</div>
	);
}
