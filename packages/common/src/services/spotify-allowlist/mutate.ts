import { runs } from "@trigger.dev/sdk";

import { manageAllowlistEntryTask } from "../../trigger/tasks/spotify-allowlist/manage-allowlist-entry";

/**
 * Triggers the Playwright allowlist worker and waits for it to finish.
 * `triggerAndWait` only works from inside another task's `run()` — this is
 * called from both a plain auth request handler and other tasks' `run()`
 * bodies, so trigger + poll is the one pattern that works from both.
 * Throws on any non-success outcome. `runs.poll()` crosses a Trigger.dev run
 * boundary, so a worker-thrown `AllowlistBudgetExhaustedError` does NOT
 * survive as that class here — only its message string does. Callers that
 * need to distinguish a budget wait from a real failure must match on the
 * message (see `isBudgetExhaustedMessage` in manage-allowlist-entry.ts), not
 * `instanceof`.
 */
export async function runAllowlistMutation(
	email: string,
	action: "add" | "remove",
): Promise<void> {
	const handle = await manageAllowlistEntryTask.trigger({ email, action });
	const result = await runs.poll(handle);
	if (!result.isSuccess) {
		throw new Error(
			result.error?.message ??
				`Spotify allowlist ${action} run ${result.status.toLowerCase()}`,
		);
	}
}
