export type UserPlan = "free" | "pro";

export interface PlanUser {
	plan?: string | null;
	planExpiresAt?: Date | string | null;
}

/**
 * Checks if a user has an active Pro plan.
 * Returns true if user.plan === "pro" and planExpiresAt is either null (active recurring) or in the future.
 */
export function isPro(user?: PlanUser | null): boolean {
	if (user?.plan !== "pro") {
		return false;
	}
	if (!user.planExpiresAt) {
		return true;
	}
	const expiry =
		user.planExpiresAt instanceof Date
			? user.planExpiresAt
			: new Date(user.planExpiresAt);

	if (Number.isNaN(expiry.getTime())) {
		return false;
	}

	return expiry.getTime() > Date.now();
}
