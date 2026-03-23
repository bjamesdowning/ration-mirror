/**
 * Admin utilities for onboarding progress display (shared; safe for client bundles).
 */

const ONBOARDING_STEP_MAX = 6;
const ONBOARDING_STEP_COUNT = 7;

/**
 * Formats user settings into a human-readable onboarding label for the admin panel.
 * Safe for invalid/missing settings.
 */
export function formatOnboardingAdminLabel(settings: unknown): string {
	if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
		return "—";
	}

	const s = settings as {
		onboardingCompletedAt?: string;
		onboardingStep?: unknown;
	};

	if (
		typeof s.onboardingCompletedAt === "string" &&
		s.onboardingCompletedAt.length > 0
	) {
		return "Completed";
	}

	const step = typeof s.onboardingStep === "number" ? s.onboardingStep : NaN;
	if (Number.isFinite(step) && step >= 0) {
		const n = Math.min(Math.floor(step), ONBOARDING_STEP_MAX) + 1;
		return `Step ${n}/${ONBOARDING_STEP_COUNT}`;
	}

	return "Not started";
}
