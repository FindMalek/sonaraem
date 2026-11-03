"use client";

import {
	Button,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
	Icons,
} from "@sonaraem/ui";
import { useOrganizeController } from "@/shared/lib/organize/controller.hook";
import {
	usePlaylistsController,
	usePlaylistTagsController,
} from "@/shared/lib/playlists/controller.hook";
import { PageHeader } from "../shared/page-header";
import { DashboardPlaylistsSortSelect } from "./dashboard-playlists-sort-select";
import { DashboardPlaylistsTagFilter } from "./dashboard-playlists-tag-filter";

export function DashboardPlaylistsPageHeader({
	hasPlaylists,
}: {
	hasPlaylists: boolean;
}) {
	const { organizeMutation } = useOrganizeController();
	const {
		exportAllMutation: exportMutation,
		sort,
		setSort,
		filters,
		toggleTagFilter,
		clearFilters,
	} = usePlaylistsController();
	const { tags } = usePlaylistTagsController();
	const isBusy = exportMutation.isPending || organizeMutation.isPending;

	return (
		<div className="sticky -top-5 z-10 -mx-4 -mt-4 flex items-start justify-between gap-4 bg-background px-4 pt-4 pb-3">
			<PageHeader
				title="AI Playlists"
				description="Generated from your taste."
			/>
			<div className="flex shrink-0 items-center gap-2">
				{hasPlaylists ? (
					<DashboardPlaylistsTagFilter
						options={tags.data ?? []}
						selected={filters.tags}
						status={tags.status}
						onToggle={toggleTagFilter}
						onClear={clearFilters}
					/>
				) : null}
				{hasPlaylists ? (
					<DashboardPlaylistsSortSelect value={sort} onChange={setSort} />
				) : null}
				{hasPlaylists ? (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								type="button"
								variant="default"
								className="size-11 shrink-0 rounded-none"
								disabled={isBusy}
								aria-label="Playlist actions"
							>
								{isBusy ? (
									<Icons.spinner className="size-5 shrink-0 animate-spin" />
								) : (
									<Icons.plus className="size-5 shrink-0" />
								)}
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="min-w-48">
							<DropdownMenuItem
								disabled={exportMutation.isPending}
								onSelect={() => {
									exportMutation.mutate({});
								}}
							>
								Send all to Spotify
							</DropdownMenuItem>
							<DropdownMenuItem
								disabled={organizeMutation.isPending}
								onSelect={() => {
									organizeMutation.mutate({});
								}}
							>
								Run analysis again
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				) : null}
			</div>
		</div>
	);
}
