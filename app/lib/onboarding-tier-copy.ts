import { WELCOME_CREDITS } from "~/lib/billing.constants";
import {
	FREE_FUEL_LOGS_LABEL,
	UNLIMITED_FUEL_LOGS,
} from "~/lib/crew-fuel-copy";
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
				`${FREE_FUEL_LOGS_LABEL} Fuel logs per day`,
				`${WELCOME_CREDITS} welcome credits`,
				"+ AI Features (credits)",
			],
			highlight: false,
		},
		{
			name: CREW_MEMBER_PRODUCT.name,
			features: [
				"Unlimited Cargo",
				"Unlimited Meals",
				"25 Supply lists",
				UNLIMITED_FUEL_LOGS,
				"Groups & invites",
			],
			highlight: true,
		},
	];
}
