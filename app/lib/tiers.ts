export type TierSlug = "free" | "crew_member";

export interface TierLimits {
	maxInventoryItems: number; // -1 => unlimited
	maxMeals: number; // -1 => unlimited
	maxGroceryLists: number; // -1 => unlimited
	maxOwnedGroups: number;
	canInviteMembers: boolean;
	canShareGroceryLists: boolean;
}

export const TIER_LIMITS: Record<TierSlug, TierLimits> = {
	free: {
		maxInventoryItems: 35,
		maxMeals: 15,
		maxGroceryLists: 3,
		maxOwnedGroups: 1,
		canInviteMembers: false,
		canShareGroceryLists: false,
	},
	crew_member: {
		maxInventoryItems: -1,
		maxMeals: -1,
		maxGroceryLists: -1,
		maxOwnedGroups: 5,
		canInviteMembers: true,
		canShareGroceryLists: true,
	},
};

export const TIER_ORDINAL: Record<TierSlug, number> = {
	free: 0,
	crew_member: 1,
};

export const CREW_MEMBER_PRODUCT = {
	slug: "crew_member" as const,
	name: "Crew Member",
	price: "€12/year or €2/month",
	/** @deprecated Annual no longer includes credits; use WELCOME_CREDITS for signup grant. */
	creditsOnSignup: 0,
	creditsOnRenewal: 0,
	description:
		"Unlimited capacity + groups. AI features use credits on both Free and Crew Member.",
};

export function isTierSlug(value: string): value is TierSlug {
	return value === "free" || value === "crew_member";
}
