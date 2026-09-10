"use client";

import {
	Badge,
	Button,
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	Icons,
} from "@sonaraem/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";

import { toastError } from "@/shared/api/error-handler";
import { orpc } from "@/shared/api/orpc";

export function AdminSpotifyAllowlistHealthContent() {
	const queryClient = useQueryClient();

	const { data, isFetching } = useQuery(
		orpc.admin.spotifyAllowlistHealth.get.queryOptions({
			input: {},
			refetchInterval: 30_000,
		}),
	);

	const check = useMutation(
		orpc.admin.spotifyAllowlistHealth.check.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({
					queryKey: orpc.admin.spotifyAllowlistHealth.get.key(),
				});
			},
			onError: toastError,
		}),
	);

	if (!data) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Spotify automation session</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-muted-foreground text-sm">
						{isFetching ? "Loading…" : "Couldn't load session status."}
					</p>
				</CardContent>
			</Card>
		);
	}

	const status = !data.hasSession
		? { label: "Not configured", variant: "destructive" as const }
		: data.lastError
			? { label: "Broken", variant: "destructive" as const }
			: !data.lastCheckedAt
				? { label: "Not checked yet", variant: "secondary" as const }
				: { label: "OK", variant: "default" as const };

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center justify-between gap-2">
					<span className="flex items-center gap-2">
						Spotify automation session
						<Badge variant={status.variant}>{status.label}</Badge>
					</span>
					<Button
						size="sm"
						variant="outline"
						onClick={() => check.mutate({})}
						disabled={check.isPending}
					>
						{check.isPending ? (
							<Icons.spinner className="animate-spin" />
						) : (
							"Test now"
						)}
					</Button>
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-1 text-sm">
				{!data.hasSession ? (
					<p className="text-muted-foreground">
						No saved session — run{" "}
						<code className="text-xs">
							pnpm --filter @sonaraem/common run
							bootstrap:spotify-allowlist-session
						</code>{" "}
						once to seed one.
					</p>
				) : (
					<>
						<p className="text-muted-foreground">
							Last checked:{" "}
							{data.lastCheckedAt
								? formatDistanceToNow(new Date(data.lastCheckedAt), {
										addSuffix: true,
									})
								: "never"}
						</p>
						<p className="text-muted-foreground">
							Last real add/remove:{" "}
							{data.lastWriteAt
								? formatDistanceToNow(new Date(data.lastWriteAt), {
										addSuffix: true,
									})
								: "never"}
						</p>
						{data.lastError && (
							<p className="text-destructive">{data.lastError}</p>
						)}
					</>
				)}
			</CardContent>
		</Card>
	);
}
