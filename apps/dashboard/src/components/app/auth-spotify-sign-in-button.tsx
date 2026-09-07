"use client";

import { DASHBOARD_ROUTES } from "@sonaraem/common/utils/routes";
import { Button, Icons } from "@sonaraem/ui";
import { useState } from "react";
import { env } from "@/lib/env";
import { authClient } from "@/shared/api/auth-client";

export function AuthSpotifySignInButton() {
	const [isLoading, setIsLoading] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	const handleSpotifySignIn = async () => {
		setIsLoading(true);
		setErrorMessage(null);
		try {
			// better-auth's client returns { error } rather than throwing for an
			// API-level failure (e.g. our before-hook rejecting the allowlist
			// slot acquisition) — a thrown error only covers network failures.
			const result = await authClient.signIn.social({
				provider: "spotify",
				callbackURL: `${env.NEXT_PUBLIC_SONARAEM_DASHBOARD_URL}${DASHBOARD_ROUTES.overview.path}`,
				// Otherwise the default error redirect lands on the bare API domain, no UI.
				errorCallbackURL: `${env.NEXT_PUBLIC_SONARAEM_DASHBOARD_URL}/login`,
			});
			if (result.error) {
				setIsLoading(false);
				setErrorMessage(
					result.error.message ??
						"We couldn't connect your Spotify account — please try again.",
				);
			}
			// On success the browser is about to navigate away to Spotify —
			// isLoading intentionally stays true until that happens.
		} catch (error) {
			setIsLoading(false);
			console.error("Failed to sign in with Spotify", error);
			setErrorMessage(
				"We couldn't connect your Spotify account — please try again.",
			);
		}
	};
	return (
		<div className="flex flex-col gap-2">
			<Button
				type="button"
				size="xl"
				className="w-full uppercase"
				isLoading={isLoading}
				disabled={isLoading}
				onClick={handleSpotifySignIn}
			>
				{isLoading ? "Connecting..." : "Continue with Spotify"}
				{!isLoading && <Icons.chevronRight className="h-4 w-4" />}
			</Button>
			{errorMessage && (
				<p className="text-destructive text-xs">{errorMessage}</p>
			)}
		</div>
	);
}
