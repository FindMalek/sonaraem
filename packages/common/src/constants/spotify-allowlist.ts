// Minimum spacing between real add/remove mutations against the Spotify
// dashboard, enforced globally (not per slot) inside manageAllowlistEntryTask
// — the automation account has exactly one Playwright session, so this is
// the whole anti-detection guarantee. Tune up if Spotify ever pushes back;
// there's no data yet suggesting it needs to be.
export const DEFAULT_ALLOWLIST_WRITE_GAP_MS = 15 * 1000;
export const DEFAULT_OCCUPIED_TIMEOUT_MS = 30 * 60 * 1000;
