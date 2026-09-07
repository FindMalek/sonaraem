"use client";

import type { AdminUserItem } from "@sonaraem/common/schemas";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	Badge,
} from "@sonaraem/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { parseAsInteger, parseAsString, useQueryStates } from "nuqs";
import { useState } from "react";

import { toastError } from "@/shared/api/error-handler";
import { orpc } from "@/shared/api/orpc";
import { AdminDataTable } from "./admin-data-table";
import { AdminRowActions } from "./admin-row-actions";
import { AdminTablePagination } from "./admin-table-pagination";
import { AdminTableToolbar } from "./admin-table-toolbar";

const USERS_PARAMS = {
	page: parseAsInteger.withDefault(1),
	pageSize: parseAsInteger.withDefault(25),
	q: parseAsString.withDefault(""),
};

export function AdminUsersContent() {
	const queryClient = useQueryClient();

	const [params, setParams] = useQueryStates(USERS_PARAMS, {
		shallow: false,
		startTransition: undefined,
	});

	const [deleteTarget, setDeleteTarget] = useState<AdminUserItem | null>(null);

	const { data, isFetching } = useQuery(
		orpc.admin.users.list.queryOptions({
			input: {
				page: params.page,
				pageSize: params.pageSize,
				q: params.q || undefined,
			},
		}),
	);

	const { mutate: deleteUser, isPending: isDeleting } = useMutation(
		orpc.admin.users.delete.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({ queryKey: orpc.admin.users.key() });
				setDeleteTarget(null);
			},
			onError: toastError,
		}),
	);

	const columns: ColumnDef<AdminUserItem>[] = [
		{ accessorKey: "name", header: "Name" },
		{ accessorKey: "email", header: "Email" },
		{
			accessorKey: "role",
			header: "Role",
			cell: ({ row }) =>
				row.original.role ? (
					<Badge variant="secondary">{row.original.role}</Badge>
				) : (
					<span className="text-muted-foreground text-sm">user</span>
				),
		},
		{
			accessorKey: "isApproved",
			header: "Approved",
			cell: ({ row }) =>
				row.original.isApproved ? (
					<Badge variant="default">Yes</Badge>
				) : (
					<Badge variant="secondary">No</Badge>
				),
		},
		{
			accessorKey: "banned",
			header: "Banned",
			cell: ({ row }) =>
				row.original.banned ? (
					<Badge variant="destructive">Yes</Badge>
				) : (
					<span className="text-muted-foreground text-sm">—</span>
				),
		},
		{
			accessorKey: "createdAt",
			header: "Joined",
			cell: ({ row }) => format(new Date(row.original.createdAt), "d MMM yyyy"),
		},
		{
			id: "actions",
			header: "",
			cell: ({ row }) =>
				row.original.role === "admin" ? null : (
					<AdminRowActions
						actions={[
							{
								label: "Delete",
								onClick: () => setDeleteTarget(row.original),
								variant: "destructive",
							},
						]}
					/>
				),
		},
	];

	return (
		<div className="space-y-4">
			<AdminTableToolbar
				searchPlaceholder="Search by name or email…"
				currentSearch={params.q}
				currentStatus={undefined}
				onSearch={(value) => setParams({ q: value, page: 1 })}
				onStatusChange={() => null}
			/>

			<AdminDataTable
				columns={columns}
				data={data?.items ?? []}
				isLoading={isFetching && !data}
			/>

			<AdminTablePagination
				total={data?.total ?? 0}
				page={params.page}
				pageSize={params.pageSize}
				pageCount={data?.pageCount ?? 1}
				onPageChange={(p) => setParams({ page: p })}
				onPageSizeChange={(size) => setParams({ pageSize: size, page: 1 })}
			/>

			<AlertDialog
				open={deleteTarget !== null}
				onOpenChange={(open) => !open && setDeleteTarget(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete this user?</AlertDialogTitle>
						<AlertDialogDescription>
							This permanently deletes {deleteTarget?.email} and everything tied
							to their account — library cache, playlists, and AI analysis. This
							cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							isLoading={isDeleting}
							onClick={() =>
								deleteTarget && deleteUser({ id: deleteTarget.id })
							}
						>
							{isDeleting ? "Deleting..." : "Delete"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
