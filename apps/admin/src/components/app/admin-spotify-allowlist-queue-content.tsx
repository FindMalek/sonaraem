"use client";

import type {
	AllowlistQueueAdminItem,
	AllowlistQueuePriority,
	AllowlistQueueStatus,
	AllowlistSlotAdminItem,
	AllowlistSlotStatus,
} from "@sonaraem/common/schemas";
import {
	Badge,
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@sonaraem/ui";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";

import { orpc } from "@/shared/api/orpc";

const SLOT_STATUS_VARIANTS: Record<
	AllowlistSlotStatus,
	"secondary" | "default" | "outline" | "destructive"
> = {
	available: "secondary",
	occupied: "default",
	reclaiming: "destructive",
};

const QUEUE_STATUS_VARIANTS: Record<
	AllowlistQueueStatus,
	"secondary" | "default" | "destructive" | "outline"
> = {
	waiting: "secondary",
	active: "default",
	done: "outline",
	failed: "destructive",
	cancelled: "outline",
};

const PRIORITY_VARIANTS: Record<AllowlistQueuePriority, "default" | "outline"> =
	{
		login: "default",
		manual: "default",
		cron: "outline",
	};

function SlotCard({ slot }: { slot: AllowlistSlotAdminItem }) {
	return (
		<div className="flex flex-col gap-1.5 rounded-lg border p-3">
			<div className="flex items-center justify-between">
				<span className="font-medium text-sm">
					Slot {slot.id}
					<span className="ml-1.5 font-normal text-muted-foreground text-xs">
						{slot.kind}
					</span>
				</span>
				<Badge variant={SLOT_STATUS_VARIANTS[slot.status]}>{slot.status}</Badge>
			</div>
			{slot.email && (
				<span className="truncate text-muted-foreground text-xs">
					{slot.email}
				</span>
			)}
			{slot.status === "reclaiming" && (
				<span className="text-destructive text-xs">
					Stuck — needs manual cleanup
				</span>
			)}
			{slot.releasedAt && slot.status === "available" && (
				<span className="text-muted-foreground text-xs">
					Freed{" "}
					{formatDistanceToNow(new Date(slot.releasedAt), { addSuffix: true })}
				</span>
			)}
		</div>
	);
}

function RequestRow({ item }: { item: AllowlistQueueAdminItem }) {
	return (
		<TableRow>
			<TableCell className="max-w-48 truncate">{item.identityLabel}</TableCell>
			<TableCell>
				<Badge variant={PRIORITY_VARIANTS[item.priority]}>
					{item.priority}
				</Badge>
			</TableCell>
			<TableCell>
				<Badge variant={QUEUE_STATUS_VARIANTS[item.status]}>
					{item.status}
				</Badge>
			</TableCell>
			<TableCell className="text-muted-foreground text-xs">
				{item.email ?? "—"}
			</TableCell>
			<TableCell className="text-muted-foreground text-xs">
				{formatDistanceToNow(new Date(item.requestedAt), { addSuffix: true })}
			</TableCell>
			<TableCell className="text-muted-foreground text-xs">
				{item.completedAt
					? formatDistanceToNow(new Date(item.completedAt), {
							addSuffix: true,
						})
					: "—"}
			</TableCell>
			<TableCell className="max-w-64 truncate text-destructive text-xs">
				{item.error ?? "—"}
			</TableCell>
		</TableRow>
	);
}

export function AdminSpotifyAllowlistQueueContent() {
	const { data, isFetching } = useQuery(
		orpc.admin.spotifyAllowlistQueue.list.queryOptions({
			refetchInterval: 5_000,
		}),
	);

	const slots = data?.slots ?? [];
	const requests = data?.requests ?? [];
	const waitingCount = requests.filter((r) => r.status === "waiting").length;

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle>Slot pool</CardTitle>
				</CardHeader>
				<CardContent>
					{slots.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							{isFetching ? "Loading…" : "No slots seeded yet."}
						</p>
					) : (
						<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
							{slots.map((slot) => (
								<SlotCard key={slot.id} slot={slot} />
							))}
						</div>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						Requests
						{waitingCount > 0 && (
							<Badge variant="secondary">{waitingCount} waiting</Badge>
						)}
					</CardTitle>
				</CardHeader>
				<CardContent>
					{requests.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							{isFetching ? "Loading…" : "No requests yet."}
						</p>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Identity</TableHead>
									<TableHead>Priority</TableHead>
									<TableHead>Status</TableHead>
									<TableHead>Email</TableHead>
									<TableHead>Requested</TableHead>
									<TableHead>Completed</TableHead>
									<TableHead>Error</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{requests.map((item) => (
									<RequestRow key={item.id} item={item} />
								))}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
