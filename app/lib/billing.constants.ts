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

/** RC subscription product that includes annual Crew Member credit bonus. */
export const RC_PRODUCT_CREW_ANNUAL = "crew_annual";

/** Credits granted on Crew Member annual purchase or renewal. */
export const CREW_ANNUAL_CREDIT_BONUS = 65;
