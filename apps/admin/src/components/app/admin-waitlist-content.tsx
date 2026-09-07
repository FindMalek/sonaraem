"use client";

import type {
	WaitlistAdminItem,
	WaitlistStatus,
} from "@sonaraem/common/schemas";
import { Badge, Button, Checkbox, Icons } from "@sonaraem/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef, RowSelectionState } from "@tanstack/react-table";
import { format } from "date-fns";
import {
	parseAsInteger,
	parseAsString,
	parseAsStringLiteral,
	useQueryStates,
} from "nuqs";
import { useCallback, useEffect, useState } from "react";

import { toastError } from "@/shared/api/error-handler";
import { orpc } from "@/shared/api/orpc";
import { AdminDataTable } from "./admin-data-table";
import { AdminRowActions } from "./admin-row-actions";
import { AdminTablePagination } from "./admin-table-pagination";
import { AdminTableToolbar } from "./admin-table-toolbar";
import { AdminWaitlistDetailSheet } from "./admin-waitlist-detail-sheet";

const STATUS_OPTIONS = [
	{ value: "pending", label: "Pending" },
	{ value: "approved", label: "Approved" },
	{ value: "rejected", label: "Rejected" },
];

function isWaitlistStatus(value: string): value is WaitlistStatus {
	return value === "pending" || value === "approved" || value === "rejected";
}

const STATUS_VARIANTS = {
	pending: "secondary",
	approved: "default",
	rejected: "destructive",
} as const;

const WAITLIST_PARAMS = {
	page: parseAsInteger.withDefault(1),
	pageSize: parseAsInteger.withDefault(25),
	status: parseAsStringLiteral(["pending", "approved", "rejected"] as const),
	q: parseAsString.withDefault(""),
};

export function AdminWaitlistContent() {
	const queryClient = useQueryClient();

	const [params, setParams] = useQueryStates(WAITLIST_PARAMS, {
		shallow: false,
		startTransition: undefined,
	});

	const page = params.page;
	const pageSize = params.pageSize;
	const status = params.status ?? undefined;
	const q = params.q;

	const [selectedItem, setSelectedItem] = useState<WaitlistAdminItem | null>(
		null,
	);
	const [isSheetOpen, setIsSheetOpen] = useState(false);
	const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

	const { data, isFetching } = useQuery(
		orpc.admin.waitlist.list.queryOptions({
			input: { page, pageSize, status, q: q || undefined },
		}),
	);

	// Selection is scoped to the current page/filter — drop it when any change
	const waitlistFilterKey = `${page}|${pageSize}|${status}|${q ?? ""}`;
	useEffect(() => {
		void waitlistFilterKey;
		setRowSelection({});
	}, [waitlistFilterKey]);

	// orpc's query keys are [path, meta] tuples — invalidating with this matches
	// every cached variation (any page/status/search) of admin.waitlist.*
	const invalidateWaitlist = useCallback(() => {
		queryClient.invalidateQueries({ queryKey: orpc.admin.waitlist.key() });
		queryClient.invalidateQueries({ queryKey: orpc.admin.stats.key() });
	}, [queryClient]);

	const { mutate: updateStatus, isPending: isActionLoading } = useMutation(
		orpc.admin.waitlist.updateStatus.mutationOptions({
			onSuccess: () => {
				invalidateWaitlist();
				setIsSheetOpen(false);
			},
			onError: toastError,
		}),
	);

	const { mutate: bulkApprove, isPending: isBulkApproving } = useMutation(
		orpc.admin.waitlist.bulkApprove.mutationOptions({
			onSuccess: () => {
				invalidateWaitlist();
				setRowSelection({});
			},
			onError: toastError,
		}),
	);

	const { mutate: bulkReject, isPending: isBulkRejecting } = useMutation(
		orpc.admin.waitlist.bulkReject.mutationOptions({
			onSuccess: () => {
				invalidateWaitlist();
				setRowSelection({});
			},
			onError: toastError,
		}),
	);

	const { mutate: resendInvite, isPending: isResending } = useMutation(
		orpc.admin.waitlist.resendInvite.mutationOptions({
			onSuccess: () => invalidateWaitlist(),
			onError: toastError,
		}),
	);

	const handleApprove = useCallback(
		(id: number) => updateStatus({ id, status: "approved" }),
		[updateStatus],
	);

	const handleReject = useCallback(
		(id: number) => updateStatus({ id, status: "rejected" }),
		[updateStatus],
	);

	const handleResendInvite = useCallback(
		(id: number) => resendInvite({ id }),
		[resendInvite],
	);

	const handleSaveNote = useCallback(
		(id: number, status: WaitlistAdminItem["status"], note: string) =>
			updateStatus({ id, status, note }),
		[updateStatus],
	);

	const canResendInvite = (item: WaitlistAdminItem) =>
		item.status === "approved" && !item.inviteRedeemedAt;

	const selectedIds = Object.keys(rowSelection)
		.filter((id) => rowSelection[id])
		.map(Number);

	const columns: ColumnDef<WaitlistAdminItem>[] = [
		{
			id: "select",
			header: ({ table }) => (
				<Checkbox
					checked={
						table.getIsAllPageRowsSelected()
							? true
							: table.getIsSomePageRowsSelected()
								? "indeterminate"
								: false
					}
					onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
					aria-label="Select all"
				/>
			),
			cell: ({ row }) => (
				<Checkbox
					checked={row.getIsSelected()}
					onCheckedChange={(value) => row.toggleSelected(!!value)}
					aria-label="Select row"
				/>
			),
			enableSorting: false,
		},
		{
			accessorKey: "email",
			header: "Email",
		},
		{
			accessorKey: "spotifyEmail",
			header: "Spotify email",
			cell: ({ row }) =>
				row.original.spotifyEmail ?? (
					<span className="text-muted-foreground italic">not collected</span>
				),
		},
		{
			accessorKey: "status",
			header: "Status",
			cell: ({ row }) => (
				<Badge variant={STATUS_VARIANTS[row.original.status]}>
					{row.original.status}
				</Badge>
			),
		},
		{
			accessorKey: "createdAt",
			header: "Signed up",
			cell: ({ row }) => format(new Date(row.original.createdAt), "d MMM yyyy"),
		},
		{
			accessorKey: "approvedAt",
			header: "Approved at",
			cell: ({ row }) =>
				row.original.approvedAt
					? format(new Date(row.original.approvedAt), "d MMM yyyy")
					: "—",
		},
		{
			id: "actions",
			header: "",
			cell: ({ row }) => (
				<AdminRowActions
					actions={[
						{
							label: "View details",
							onClick: () => {
								setSelectedItem(row.original);
								setIsSheetOpen(true);
							},
						},
						...(row.original.status !== "approved"
							? [
									{
										label: "Approve",
										onClick: () => handleApprove(row.original.id),
									},
								]
							: []),
						...(row.original.status === "pending"
							? [
									{
										label: "Reject",
										onClick: () => handleReject(row.original.id),
										variant: "destructive" as const,
									},
								]
							: []),
						...(canResendInvite(row.original)
							? [
									{
										label: "Resend invite",
										onClick: () => handleResendInvite(row.original.id),
									},
								]
							: []),
					]}
				/>
			),
		},
	];

	return (
		<div className="space-y-4">
			<AdminTableToolbar
				searchPlaceholder="Search by email…"
				statusOptions={STATUS_OPTIONS}
				currentSearch={q}
				currentStatus={status}
				onSearch={(value) => setParams({ q: value, page: 1 })}
				onStatusChange={(value) =>
					setParams({
						status: value && isWaitlistStatus(value) ? value : null,
						page: 1,
					})
				}
			/>

			{selectedIds.length > 0 && (
				<div className="flex items-center gap-3 rounded-md border bg-muted/40 px-3 py-2">
					<span className="text-muted-foreground text-xs">
						{selectedIds.length} selected
					</span>
					<Button
						size="sm"
						variant="outline"
						onClick={() => bulkApprove({ ids: selectedIds })}
						disabled={isBulkApproving || isBulkRejecting}
						isLoading={isBulkApproving}
					>
						<Icons.circleCheck />
						Approve
					</Button>
					<Button
						size="sm"
						variant="outline"
						onClick={() => bulkReject({ ids: selectedIds })}
						disabled={isBulkApproving || isBulkRejecting}
						isLoading={isBulkRejecting}
					>
						<Icons.x />
						Reject
					</Button>
				</div>
			)}

			<AdminDataTable
				columns={columns}
				data={data?.items ?? []}
				isLoading={isFetching && !data}
				getRowId={(row) => String(row.id)}
				rowSelection={rowSelection}
				onRowSelectionChange={setRowSelection}
			/>

			<AdminTablePagination
				total={data?.total ?? 0}
				page={page}
				pageSize={pageSize}
				pageCount={data?.pageCount ?? 1}
				onPageChange={(p) => setParams({ page: p })}
				onPageSizeChange={(size) => setParams({ pageSize: size, page: 1 })}
			/>

			<AdminWaitlistDetailSheet
				item={selectedItem}
				open={isSheetOpen}
				onOpenChange={setIsSheetOpen}
				onApprove={handleApprove}
				onReject={handleReject}
				onResendInvite={handleResendInvite}
				onSaveNote={handleSaveNote}
				isActionLoading={isActionLoading || isResending}
			/>
		</div>
	);
}
