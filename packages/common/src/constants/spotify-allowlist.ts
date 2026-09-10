// Minimum spacing between real add/remove mutations against the Spotify
// dashboard, enforced globally (not per slot) inside manageAllowlistEntryTask
// — the automation account has exactly one Playwright session, so this is
// the whole anti-detection guarantee. Tune up if Spotify ever pushes back;
// there's no data yet suggesting it needs to be.
export const DEFAULT_ALLOWLIST_WRITE_GAP_MS = 15 * 1000;

// Spotify's Dev Mode allowlist hard-caps at 5 emails total; 1 is permanently reserved for the admin/dev account (SONARAEM_SPOTIFY_ALLOWLIST_ADMIN_EMAIL), leaving this many real-user seats (#392).
export const MAX_ALLOWLISTED_REAL_USERS = 4;
