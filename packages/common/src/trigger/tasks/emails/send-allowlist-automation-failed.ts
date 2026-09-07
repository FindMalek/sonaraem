import { task } from "@trigger.dev/sdk";

import { sendAllowlistAutomationFailedNotification } from "../../../services/email";

export const sendAllowlistAutomationFailedEmailTask = task({
	id: "email-send-spotify-allowlist-failed",
	retry: { maxAttempts: 2, minTimeoutInMs: 2000, factor: 2 },
	run: async ({
		targetEmail,
		action,
		errorMessage,
	}: {
		targetEmail: string;
		action: "add" | "remove";
		errorMessage: string;
	}) => {
		const result = await sendAllowlistAutomationFailedNotification({
			targetEmail,
			action,
			errorMessage,
		});
		// provider_not_configured / no_admin_account are permanent for this
		// run — retrying won't change them. A transport failure might, so
		// throw to let Trigger.dev's retry policy actually kick in.
		if (!result.ok && result.reason === "send_failed") {
			throw new Error(result.error);
		}
		return result;
	},
});
