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
		maxInventoryItems: 50,
		maxMeals: 20,
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
	creditsOnSignup: 65,
	creditsOnRenewal: 65,
	description:
		"Unlimited capacity + groups. Annual plan includes 65 credits on start and renewal; Monthly has no included credits.",
};

export const WELCOME_VOUCHER = {
	promoCode: "WELCOME65",
	appliesTo: "SUPPLY_RUN",
	discountPercent: 100,
	/** User-facing note: valid for Supply Run only */
	description: "Supply Run only",
};

export function isTierSlug(value: string): value is TierSlug {
	return value === "free" || value === "crew_member";
}
