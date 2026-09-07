import { AdminShell } from "@/components/app/admin-shell";
import { AdminSpotifyLoginRelayContent } from "@/components/app/admin-spotify-login-relay-content";

export default function SpotifyLoginRelayPage() {
	return (
		<AdminShell
			title="Spotify login relay"
			description="The allowlist-rotation automation's login hits an email OTP prompt it can't complete itself — paste the code you receive by email here to let it continue."
		>
			<AdminSpotifyLoginRelayContent />
		</AdminShell>
	);
}
