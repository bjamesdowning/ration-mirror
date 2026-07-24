import { z } from "zod";

const TierSlugSchema = z.enum(["free", "crew_member"]);

export const MobileBillingStatusSchema = z.object({
	/** Personal account tier (purchase / entitlement ownership). Same as accountTier. */
	tier: TierSlugSchema,
	accountTier: TierSlugSchema,
	accountTierExpired: z.boolean(),
	/** Active organization effective tier (owner-derived household capacity). */
	organizationTier: TierSlugSchema,
	organizationTierExpired: z.boolean(),
	entitlements: z.object({
		crew_member: z.object({
			active: z.boolean(),
			expiresAt: z.string().nullable(),
			store: z.string().nullable(),
		}),
	}),
	management: z.object({
		store: z.string().nullable(),
		url: z.string().nullable(),
	}),
	canPurchaseSubscription: z.boolean(),
	purchaseBlockReason: z.string().nullable(),
	billingUnavailable: z.boolean(),
	credits: z.number().int().nonnegative(),
});
