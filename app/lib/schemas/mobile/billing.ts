import { z } from "zod";

export const MobileBillingStatusSchema = z.object({
	tier: z.string(),
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
});
