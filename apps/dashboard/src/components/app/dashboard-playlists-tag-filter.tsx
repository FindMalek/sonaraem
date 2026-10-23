"use client";

import {
	Badge,
	Button,
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
	Icons,
} from "@sonaraem/ui";

type Props = {
	options: string[];
	selected: string[];
	status: "pending" | "error" | "success";
	onToggle: (tag: string) => void;
	onClear: () => void;
};

function getStatusMessage(status: Props["status"], optionCount: number) {
	if (status === "pending") return "Loading tags…";
	if (status === "error") return "Couldn't load tags";
	if (optionCount === 0) return "No tags yet";
	return null;
}

export function DashboardPlaylistsTagFilter({
	options,
	selected,
	status,
	onToggle,
	onClear,
}: Props) {
	const selectedCount = selected.length;
	const statusMessage = getStatusMessage(status, options.length);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					type="button"
					variant="outline"
					className="relative size-11 shrink-0 rounded-none"
					aria-label={
						selectedCount > 0
							? `Filter playlists by tag (${selectedCount} selected)`
							: "Filter playlists by tag"
					}
				>
					<Icons.filter className="size-5 shrink-0" />
					{selectedCount > 0 ? (
						<Badge
							aria-hidden
							className="pointer-events-none absolute top-1 right-1 h-4 min-w-4 px-1 text-[10px] tabular-nums"
						>
							{selectedCount}
						</Badge>
					) : null}
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="min-w-48">
				<DropdownMenuLabel>Filter by tag</DropdownMenuLabel>
				{statusMessage ? (
					<p className="px-2 pb-2 text-muted-foreground text-xs">
						{statusMessage}
					</p>
				) : (
					<DropdownMenuGroup className="max-h-64 overflow-y-auto">
						{options.map((tag) => (
							<DropdownMenuCheckboxItem
								key={tag}
								checked={selected.includes(tag)}
								onCheckedChange={() => onToggle(tag)}
								onSelect={(event) => event.preventDefault()}
							>
								{tag}
							</DropdownMenuCheckboxItem>
						))}
					</DropdownMenuGroup>
				)}
				{selectedCount > 0 ? (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuItem onSelect={onClear}>
							Clear filters
						</DropdownMenuItem>
					</>
				) : null}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
