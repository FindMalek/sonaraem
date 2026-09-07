"use client";

import { DASHBOARD_ROUTES } from "@sonaraem/common/utils/routes";
import { Button, Icons } from "@sonaraem/ui";
import { useState } from "react";
import { env } from "@/lib/env";
import { authClient } from "@/shared/api/auth-client";

export function AuthSpotifySignInButton() {
	const [isLoading, setIsLoading] = useState(false);

	const handleSpotifySignIn = async () => {
		setIsLoading(true);
		try {
			await authClient.signIn.social({
				provider: "spotify",
				callbackURL: `${env.NEXT_PUBLIC_SONARAEM_DASHBOARD_URL}${DASHBOARD_ROUTES.overview.path}`,
				// Otherwise the default error redirect lands on the bare API domain, no UI.
				errorCallbackURL: `${env.NEXT_PUBLIC_SONARAEM_DASHBOARD_URL}/login`,
			});
		} catch (error) {
			setIsLoading(false);
			console.error("Failed to sign in with Spotify", error);
		}
	};
	return (
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
	);
}
