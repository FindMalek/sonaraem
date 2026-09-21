// Generic AES-256-GCM string encrypt/decrypt — despite the "SessionState"
// name, also used for OTP codes (spotify-login-relay). Not renamed to avoid
// unrelated churn on the crypto module's tested public API.
export { decryptSessionState, encryptSessionState } from "./crypto";
export { runAllowlistMutation } from "./mutate";
export type {
	MutationBudgetStatus,
	MutationDirection,
} from "./mutation-budget";
export {
	countMutationsInWindow,
	getMutationBudgetStatus,
	hasMutationBudget,
	recordMutation,
	SAFE_MUTATION_BUDGET_PER_DIRECTION,
} from "./mutation-budget";
export type {
	AllowlistIdentity,
	EnsureAllowlistedResult,
} from "./permanent-allowlist";
export {
	AllowlistCapacityError,
	ensureAllowlisted,
	isIdentityAllowlisted,
	reserveRotationSeat,
} from "./permanent-allowlist";
export type { RotationEntry } from "./rotation-entry";
export {
	backfillAllowlistEntryUserId,
	findDueForRefresh,
	getRotationEntryByUserId,
	markRotationEntryOffList,
	markRotationEntryOnList,
	markRotationEntryServiced,
} from "./rotation-entry";
export type { ConsolidatedBatch, RotationJobType } from "./rotation-job";
export {
	enqueueExport,
	enqueueSnapshotRefresh,
	getNextConsolidatedBatch,
	markJobsDone,
	markJobsFailed,
	requeueForBudget,
} from "./rotation-job";
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
