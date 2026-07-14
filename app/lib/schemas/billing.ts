import { z } from "zod";

const TierSlugSchema = z.enum(["free", "crew_member"]);
const GroupMemberRoleSchema = z.enum(["owner", "admin", "member"]);

export const BillingAccountSummarySchema = z.object({
	account: z.object({
		tier: TierSlugSchema,
		tierExpired: z.boolean(),
		renewsOrEndsAt: z.string().nullable(),
		cancelAtPeriodEnd: z.boolean(),
		crewSubscribedAt: z.string().nullable(),
	}),
	organization: z.object({
		id: z.string(),
		name: z.string(),
		credits: z.number().int().nonnegative(),
		effectiveTier: TierSlugSchema,
		effectiveTierExpired: z.boolean(),
		userRole: GroupMemberRoleSchema,
	}),
	subscription: z.object({
		active: z.boolean(),
		store: z.string().nullable(),
		managementUrl: z.string().nullable(),
		canPurchaseOnWeb: z.boolean(),
		purchaseBlockReason: z.string().nullable(),
		billingUnavailable: z.boolean(),
	}),
	actions: z.object({
		pricingUrl: z.string().url(),
		settingsUrl: z.string().url(),
		portalAvailable: z.boolean(),
	}),
	copilot: z.object({
		freeConversationsRemaining: z.number().int().nonnegative(),
		creditBalance: z.number().int().nonnegative(),
		autoDeductConsent: z.boolean(),
		tokensPerCredit: z.number().int().positive(),
		sessionMaxTokens: z.number().int().positive(),
	}),
});

export type BillingAccountSummary = z.infer<typeof BillingAccountSummarySchema>;

/** Keys that must never appear in agent-facing billing output. */
export const BILLING_SUMMARY_DENYLIST_KEYS = [
	"stripeCustomerId",
	"stripe_customer_id",
	"card",
	"paymentMethod",
] as const;

export const RevenueCatWebhookEventSchema = z.object({
	api_version: z.string().optional(),
	event: z.object({
		type: z.string(),
		id: z.string(),
		app_user_id: z.string().min(1),
		// RevenueCat sends explicit `null` on many fields; `.optional()` alone rejects null.
		product_id: z.string().nullish(),
		entitlement_ids: z.array(z.string()).nullish(),
		expiration_at_ms: z.number().nullish(),
		store: z.string().nullish(),
	}),
});
