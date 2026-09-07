export {
	type EmailTemplateCategory,
	getEmailTemplateCategory,
} from "./categories";
export { markEmailDelivery, reserveEmailDelivery } from "./dedupe";
export {
	type EmailPolicyDecision,
	ensureUserEmailPreferences,
	evaluateEmailPolicy,
	upsertEmailSuppression,
} from "./policy";
export { sendInvoiceNotification } from "./send-billing";
export { sendMarketingFeatureUpdate } from "./send-marketing";
export {
	sendAllowlistAutomationFailedNotification,
	sendFeedback3DayNotification,
	sendOrganizeCompleteNotification,
	sendOrganizeWeeklyDigestNotification,
	sendSpotifyReauthNotification,
	sendWelcomeNotification,
} from "./send-transactional";
export {
	sendWaitlistApprovedNotification,
	sendWaitlistConfirmationNotification,
} from "./send-waitlist";
export { wasStillWatching } from "./watching";
export {
	processResendWebhookEvent,
	type ResendWebhookEvent,
	verifyResendWebhookEvent,
} from "./webhook";
