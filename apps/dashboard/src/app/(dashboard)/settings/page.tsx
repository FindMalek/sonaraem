"use client";

import { DASHBOARD_ROUTES } from "@sonaraem/common/utils/routes";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
	Badge,
	Button,
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
	Icons,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@sonaraem/ui";
import { formatDistanceToNow } from "date-fns";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
	DashboardSettingsNavRow,
	DashboardSettingsRow,
	DashboardSettingsSection,
	DashboardSettingsSkeleton,
} from "@/components/app/dashboard-settings-section";
import { PageHeader } from "@/components/shared/page-header";
import { env } from "@/lib/env";
import { authClient } from "@/shared/api/auth-client";
import { toastError } from "@/shared/api/error-handler";
import { useSettingsController } from "@/shared/lib/settings/controller.hook";

export default function SettingsPage() {
	const router = useRouter();
	const [mounted, setMounted] = useState(false);
	useEffect(() => {
		setMounted(true);
	}, []);

	const {
		email,
		spotifyLinked,
		spotifyLoading,
		lastSync,
		statsLoading,
		needsReauth,
		theme,
		resolvedTheme,
		setTheme,
		isPro,
		planExpiresAt,
		planLoading,
		checkoutUrl,
		portalUrl,
		signOut,
		deleteAccount,
	} = useSettingsController();

	const [reconnecting, setReconnecting] = useState(false);
	const [reauthDrawerDismissed, setReauthDrawerDismissed] = useState(false);
	const handleReconnect = async () => {
		setReconnecting(true);
		try {
			const { error } = await authClient.signIn.social({
				provider: "spotify",
				callbackURL: `${env.NEXT_PUBLIC_SONARAEM_DASHBOARD_URL}${DASHBOARD_ROUTES.settings.path}`,
			});
			// A successful call redirects the browser away — reaching here at all
			// means it didn't, so treat a missing `error` the same as one present.
			if (error) {
				setReconnecting(false);
				toastError(error.message ?? "Failed to reconnect Spotify");
			}
		} catch (error) {
			setReconnecting(false);
			toastError(
				error instanceof Error ? error.message : "Failed to reconnect Spotify",
			);
		}
	};

	if (!mounted) {
		return <DashboardSettingsSkeleton />;
	}

	const lastSyncText = statsLoading
		? "..."
		: lastSync
			? formatDistanceToNow(lastSync, { addSuffix: true })
			: "Never";

	const resolvedThemeLabel = resolvedTheme === "dark" ? "Dark" : "Light";

	return (
		<div className="flex flex-col gap-6">
			<PageHeader
				title="Settings"
				description="Manage your account and app preferences."
			/>

			<Drawer
				open={needsReauth && !reauthDrawerDismissed}
				onOpenChange={(open) => setReauthDrawerDismissed(!open)}
			>
				<DrawerContent>
					<DrawerHeader>
						<DrawerTitle className="flex items-center gap-2">
							<Icons.alertTriangle className="size-4 text-yellow-600" />
							Your Spotify connection expired
						</DrawerTitle>
						<DrawerDescription>
							Reconnect to keep syncing your library and generating playlists.
						</DrawerDescription>
					</DrawerHeader>
					<DrawerFooter>
						<Button
							isLoading={reconnecting}
							disabled={reconnecting}
							onClick={() => void handleReconnect()}
						>
							Reconnect
						</Button>
					</DrawerFooter>
				</DrawerContent>
			</Drawer>

			<DashboardSettingsSection label="CONNECTED SERVICES">
				<DashboardSettingsRow
					label="Spotify"
					value={
						spotifyLoading ? (
							"..."
						) : needsReauth ? (
							<button
								type="button"
								className="flex items-center gap-1.5 text-yellow-600"
								onClick={() => setReauthDrawerDismissed(false)}
							>
								<span className="size-2 rounded-full bg-yellow-500" />
								Expired — Reconnect
							</button>
						) : spotifyLinked ? (
							<span className="flex items-center gap-1.5">
								<span className="size-2 rounded-full bg-green-500" />
								Connected
							</span>
						) : (
							"Not connected"
						)
					}
				/>
				<DashboardSettingsRow label="Last sync" value={lastSyncText} />
			</DashboardSettingsSection>

			<DashboardSettingsSection label="ACCOUNT">
				<DashboardSettingsRow label="Email" value={email ?? "..."} />
				<DashboardSettingsRow
					label="Plan"
					value={
						planLoading ? (
							"..."
						) : (
							<div className="flex items-center gap-3">
								<Badge
									variant={isPro ? "default" : "secondary"}
									className={
										isPro
											? "bg-gradient-to-r from-emerald-500 to-teal-600 font-medium text-white shadow-sm hover:from-emerald-600 hover:to-teal-700"
											: "text-xs"
									}
								>
									{isPro ? "Pro" : "Free"}
								</Badge>
								{isPro && planExpiresAt && (
									<span className="text-muted-foreground text-xs">
										Renews{" "}
										{formatDistanceToNow(planExpiresAt, { addSuffix: true })}
									</span>
								)}
								{isPro && portalUrl && (
									<a
										href={portalUrl}
										target="_blank"
										rel="noopener noreferrer"
										className="text-primary text-xs hover:underline"
									>
										Manage subscription
									</a>
								)}
								{!isPro && checkoutUrl && (
									<Button
										size="sm"
										variant="outline"
										className="h-7 px-2.5 font-medium text-xs"
										onClick={() => {
											window.open(checkoutUrl, "_blank", "noopener,noreferrer");
										}}
									>
										Upgrade to Pro
									</Button>
								)}
							</div>
						)
					}
				/>
			</DashboardSettingsSection>

			<DashboardSettingsSection label="PREFERENCES">
				<div className="flex items-center justify-between border-b py-4 last:border-b-0">
					<span className="text-muted-foreground text-sm">Theme</span>
					<Select value={theme ?? "system"} onValueChange={setTheme}>
						<SelectTrigger className="h-8 w-44 text-sm">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="system">
								{`System default (${resolvedThemeLabel})`}
							</SelectItem>
							<SelectItem value="light">Light</SelectItem>
							<SelectItem value="dark">Dark</SelectItem>
						</SelectContent>
					</Select>
				</div>
				<DashboardSettingsRow
					label="Analysis Frequency"
					value={
						<Badge variant="outline" className="text-xs">
							Coming soon
						</Badge>
					}
				/>
				<DashboardSettingsNavRow
					label="Notifications"
					subtitle="Manage email alerts and marketing preferences"
					onClick={() =>
						router.push(
							DASHBOARD_ROUTES.settings.children.notifications.path as Route,
						)
					}
				/>
			</DashboardSettingsSection>

			<Button
				variant="destructive"
				className="w-full"
				onClick={() => void signOut()}
			>
				Sign out
			</Button>

			<DashboardSettingsSection label="DANGER ZONE">
				<AlertDialog>
					<AlertDialogTrigger asChild>
						<Button variant="destructive" className="w-full">
							Delete account
						</Button>
					</AlertDialogTrigger>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>Delete your account?</AlertDialogTitle>
							<AlertDialogDescription>
								This permanently deletes your Sonaraem account, your library
								cache, generated playlists, and all AI analysis. This does not
								affect your actual Spotify account or library. This cannot be
								undone.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>Cancel</AlertDialogCancel>
							<AlertDialogAction
								variant="destructive"
								isLoading={deleteAccount.isPending}
								onClick={() => deleteAccount.mutate({})}
							>
								{deleteAccount.isPending ? "Deleting..." : "Delete account"}
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</DashboardSettingsSection>
		</div>
	);
}
