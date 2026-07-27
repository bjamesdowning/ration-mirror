/**
 * RevenueCat entitlement and product identifiers.
 * Store-specific SKUs (Stripe Price IDs, App Store product IDs) are configured
 * only in the RevenueCat dashboard — not in application code.
 */

/** Grants `user.tier = crew_member` when active in RevenueCat. */
export const RC_ENTITLEMENT_CREW_MEMBER = "crew_member";

/** RC product IDs for consumable credit packs → credit amounts. */
export const RC_PRODUCT_CREDITS: Record<string, number> = {
	credits_s: 12,
	credits_m: 65,
	credits_l: 165,
	credits_xl: 550,
};

/** RC / App Store subscription product id for Crew Member annual (ASC: `crew_annual_1yr`). */
export const RC_PRODUCT_CREW_ANNUAL = "crew_annual_1yr";

/** Legacy annual product id — still accepted if present in older RC configs. */
export const RC_PRODUCT_CREW_ANNUAL_LEGACY = "crew_annual";

/**
 * Credits granted once to new human accounts (Better Auth signup).
 * Not granted to anonymous agent stub kitchens.
 */
export const WELCOME_CREDITS = 12;
