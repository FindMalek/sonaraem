"use client";

import type { SpotifyOtpAdminItem } from "@sonaraem/common/schemas";
import {
	Badge,
	Button,
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	Field,
	FieldError,
	Icons,
	Input,
} from "@sonaraem/ui";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { z } from "zod";

import { toastError } from "@/shared/api/error-handler";
import { orpc } from "@/shared/api/orpc";

const STATUS_VARIANTS: Record<
	SpotifyOtpAdminItem["status"],
	"secondary" | "default" | "destructive" | "outline"
> = {
	pending: "secondary",
	submitted: "default",
	consumed: "outline",
	expired: "destructive",
	failed: "destructive",
};

const codeSchema = z.object({ code: z.string().trim().min(1) });

function OtpRequestRow({ item }: { item: SpotifyOtpAdminItem }) {
	const queryClient = useQueryClient();

	const submit = useMutation(
		orpc.admin.spotifyLoginRelay.submit.mutationOptions({
			onSuccess: () => {
				form.reset();
				queryClient.invalidateQueries({
					queryKey: orpc.admin.spotifyLoginRelay.key(),
				});
			},
			onError: toastError,
		}),
	);

	const form = useForm({
		defaultValues: { code: "" },
		validators: { onSubmit: codeSchema },
		onSubmit: async ({ value }) => {
			await submit.mutateAsync({ id: item.id, code: value.code });
		},
	});

	const isPending = item.status === "pending";

	return (
		<div className="flex items-center gap-3 border-b py-3 last:border-b-0">
			<div className="flex-1 space-y-1">
				<div className="flex items-center gap-2">
					<Badge variant={STATUS_VARIANTS[item.status]}>{item.status}</Badge>
					<span className="text-muted-foreground text-xs">
						Requested{" "}
						{formatDistanceToNow(new Date(item.requestedAt), {
							addSuffix: true,
						})}
					</span>
				</div>
			</div>

			{isPending && (
				<form
					className="flex items-center gap-2"
					onSubmit={(e) => {
						e.preventDefault();
						form.handleSubmit();
					}}
				>
					<form.Field
						name="code"
						children={(field) => {
							const isInvalid =
								field.state.meta.isTouched && !field.state.meta.isValid;
							return (
								<Field data-invalid={isInvalid} className="w-40">
									<Input
										id={field.name}
										name={field.name}
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(e.target.value)}
										placeholder="Code from email"
										className="h-8 text-xs"
										disabled={submit.isPending}
										aria-invalid={isInvalid}
									/>
									{isInvalid && <FieldError errors={field.state.meta.errors} />}
								</Field>
							);
						}}
					/>
					<form.Subscribe selector={(state) => state.isSubmitting}>
						{(isSubmitting) => (
							<Button type="submit" size="sm" disabled={isSubmitting}>
								{isSubmitting ? (
									<Icons.spinner className="animate-spin" />
								) : (
									"Submit"
								)}
							</Button>
						)}
					</form.Subscribe>
				</form>
			)}
		</div>
	);
}

export function AdminSpotifyLoginRelayContent() {
	// A pending request is time-bounded (~10 min), so this polls rather than requiring a manual refresh.
	const { data, isFetching } = useQuery(
		orpc.admin.spotifyLoginRelay.list.queryOptions({
			refetchInterval: 10_000,
		}),
	);

	const items = data?.items ?? [];
	const pendingCount = items.filter((i) => i.status === "pending").length;

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					Pending requests
					{pendingCount > 0 && (
						<Badge variant="destructive">{pendingCount}</Badge>
					)}
				</CardTitle>
			</CardHeader>
			<CardContent>
				{items.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						{isFetching ? "Loading…" : "No OTP requests yet."}
					</p>
				) : (
					<div>
						{items.map((item) => (
							<OtpRequestRow key={item.id} item={item} />
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
