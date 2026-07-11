import { CREW_MEMBER_PRODUCT, TIER_LIMITS } from "~/lib/tiers";

export interface OnboardingTierCopy {
	name: string;
	features: string[];
	highlight: boolean;
}

/** Tier bullets for onboarding launch step — derived from `TIER_LIMITS`. */
export function getOnboardingTierCopy(): OnboardingTierCopy[] {
	const free = TIER_LIMITS.free;
	const listLabel = free.maxGroceryLists === 1 ? "Supply list" : "Supply lists";

	return [
		{
			name: "Free",
			features: [
				`${free.maxInventoryItems} cargo`,
				`${free.maxMeals} meals`,
				`${free.maxGroceryLists} ${listLabel}`,
				"+ AI Features (credits)",
			],
			highlight: false,
		},
		{
			name: CREW_MEMBER_PRODUCT.name,
			features: [
				"Unlimited Cargo",
				"Unlimited Meals",
				"Unlimited lists",
				`${CREW_MEMBER_PRODUCT.creditsOnSignup} credits for AI scans (Annual)`,
			],
			highlight: true,
		},
	];
}
