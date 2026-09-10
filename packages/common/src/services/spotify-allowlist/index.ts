// Generic AES-256-GCM string encrypt/decrypt — despite the "SessionState"
// name, also used for OTP codes (spotify-login-relay). Not renamed to avoid
// unrelated churn on the crypto module's tested public API.
export { decryptSessionState, encryptSessionState } from "./crypto";
export type {
	AllowlistIdentity,
	EnsureAllowlistedResult,
} from "./permanent-allowlist";
export {
	AllowlistCapacityError,
	ensureAllowlisted,
	isIdentityAllowlisted,
} from "./permanent-allowlist";
export type { AllowlistSessionHealth } from "./session";
export {
	clearAllowlistSession,
	getAllowlistSessionHealth,
	getLastAllowlistWriteAt,
	loadAllowlistSession,
	recordAllowlistCheckResult,
	recordAllowlistWriteNow,
	saveAllowlistSession,
} from "./session";
