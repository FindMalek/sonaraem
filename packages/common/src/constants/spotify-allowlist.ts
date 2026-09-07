// Minimum spacing between real add/remove mutations against the Spotify
// dashboard, enforced globally (not per slot) inside manageAllowlistEntryTask
// — the automation account has exactly one Playwright session, so this is
// the whole anti-detection guarantee. Tune up if Spotify ever pushes back;
// there's no data yet suggesting it needs to be.
export const DEFAULT_ALLOWLIST_WRITE_GAP_MS = 15 * 1000;
export const DEFAULT_OCCUPIED_TIMEOUT_MS = 30 * 60 * 1000;
// The login slot only holds capacity for the span of one interactive sign-in
// — a stuck one blocks every other login behind it (there's only 1), so it
// gets a much shorter crash-timeout window than the background rotation pool.
export const LOGIN_OCCUPIED_TIMEOUT_MS = 3 * 60 * 1000;

// Upper bound on how long acquiring the login slot + running the add
// automation may take — this runs synchronously inside the sign-in HTTP
// request, not a background task, so it needs to stay well under typical
// serverless function time limits.
export const LOGIN_SLOT_ACQUIRE_TIMEOUT_MS = 20 * 1000;
export const LOGIN_SLOT_AUTOMATION_TIMEOUT_MS = 20 * 1000;
