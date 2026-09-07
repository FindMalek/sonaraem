import { AdminShell } from "@/components/app/admin-shell";
import { AdminSpotifyAllowlistQueueContent } from "@/components/app/admin-spotify-allowlist-queue-content";

export default function SpotifyAllowlistQueuePage() {
	return (
		<AdminShell
			title="Allowlist queue"
			description="Live state of the 4-slot Spotify Dev Mode rotation pool and its request history — who's waiting, who's running, and what happened."
		>
			<AdminSpotifyAllowlistQueueContent />
		</AdminShell>
	);
}
