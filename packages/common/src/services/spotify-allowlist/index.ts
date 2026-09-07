// Generic AES-256-GCM string encrypt/decrypt — despite the "SessionState"
// name, also used for OTP codes (spotify-login-relay). Not renamed to avoid
// unrelated churn on the crypto module's tested public API.
export { decryptSessionState, encryptSessionState } from "./crypto";
export type { AcquiredLoginSlot } from "./login-slot";
export {
	acquireLoginSlot,
	LoginSlotError,
	releaseLoginSlot,
} from "./login-slot";
export type {
	AcquireSlotResult,
	AllowlistIdentity,
	AllowlistPriority,
	AllowlistSlotKind,
	EnqueueResult,
	ReclaimedSlot,
	RequestOutcome,
} from "./queue";
export {
	confirmReclaimed,
	enqueue,
	failActiveRequestForSlot,
	nextEligibleForCron,
	releaseSlot,
	settleWaitingRequest,
	timeoutReclaim,
	tryAcquireSlot,
	yieldCheck,
} from "./queue";
export {
	clearAllowlistSession,
	getLastAllowlistWriteAt,
	loadAllowlistSession,
	recordAllowlistWriteNow,
	saveAllowlistSession,
} from "./session";
