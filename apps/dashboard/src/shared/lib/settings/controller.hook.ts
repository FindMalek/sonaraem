"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { authClient } from "@/shared/api/auth-client";
import { toastError } from "@/shared/api/error-handler";
import { orpc } from "@/shared/api/orpc";
import { queryKeys } from "@/shared/api/query-keys";
import { useOrganizeStore } from "@/shared/lib/organize/store";

function toSyncDate(value: unknown): Date | null {
	if (value == null) {
		return null;
	}
	if (value instanceof Date) {
		return Number.isNaN(value.getTime()) ? null : value;
	}
	if (typeof value === "string" || typeof value === "number") {
		const d = new Date(value);
		return Number.isNaN(d.getTime()) ? null : d;
	}
	return null;
}

export function useSettingsController() {
	const queryClient = useQueryClient();
	const { data: session, isPending: sessionPending } = authClient.useSession();
	const { theme, setTheme, resolvedTheme } = useTheme();

	const spotifyLinked = useQuery(
		orpc.hasSpotifyLinked.queryOptions({ input: {} }),
	);
	const libraryStats = useQuery(
		orpc.spotify.libraryStats.queryOptions({ input: {} }),
	);
	const emailPreferences = useQuery(
		orpc.emailPreferences.get.queryOptions({ input: {} }),
	);
	const billingPlan = useQuery(
		orpc.billing.getPlan.queryOptions({ input: {} }),
	);
	const updateEmailPreferences = useMutation(
		orpc.emailPreferences.update.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({
					queryKey: queryKeys.emailPreferences(),
				});
			},
			onError: (error) => {
				toastError(error.message ?? "Failed to update email preferences");
			},
		}),
	);

	const signOut = async () => {
		useOrganizeStore.getState().setActiveRunId(null);
		useOrganizeStore.getState().setIsAnalysisDrawerOpen(false);
		// Best effort — the account-deletion flow calls this after the user row
		// (and its session, via cascade) is already gone server-side, so this
		// request can legitimately error. Redirect regardless.
		await authClient.signOut().catch(() => {});
		window.location.href = "/login";
	};

	const deleteAccount = useMutation(
		orpc.deleteAccount.mutationOptions({
			onSuccess: () => signOut(),
			onError: (error) => {
				toastError(error.message ?? "Failed to delete account");
			},
		}),
	);

	return {
		session,
		sessionPending,
		email: session?.user.email ?? null,
		spotifyLinked: spotifyLinked.data ?? false,
		spotifyLoading: spotifyLinked.isLoading,
		lastSync: toSyncDate(libraryStats.data?.updatedAt),
		statsLoading: libraryStats.isLoading,
		needsReauth: libraryStats.data?.needsReauth ?? false,
		emailPreferences: emailPreferences.data ?? null,
		emailPreferencesLoading: emailPreferences.isLoading,
		plan: billingPlan.data?.plan ?? "free",
		isPro: billingPlan.data?.isPro ?? false,
		planExpiresAt: billingPlan.data?.planExpiresAt
			? new Date(billingPlan.data.planExpiresAt)
			: null,
		planLoading: billingPlan.isLoading,
		checkoutUrl: billingPlan.data?.checkoutUrl ?? null,
		portalUrl: billingPlan.data?.portalUrl ?? null,
		updateEmailPreferences,
		theme,
		resolvedTheme,
		setTheme,
		signOut,
		deleteAccount,
	};
}
