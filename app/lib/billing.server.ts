import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "~/db/schema";
import {
	RC_ENTITLEMENT_CREW_MEMBER,
	RC_PRODUCT_CREDITS,
} from "~/lib/billing.constants";
import { BILLING_ERROR_CODES } from "~/lib/billing.errors";
import {
	clearRevenueCatWebhookProcessed,
	revenueCatFulfillmentKey,
	stripeFulfillmentKey,
} from "~/lib/billing-idempotency.server";
import {
	grantCrewMemberTier,
	resolveBillingOrganizationId,
	revokeCrewMemberTier,
} from "~/lib/billing-tier.server";
import { getEffectiveTier, getGroupTierLimits } from "~/lib/capacity.server";
import { getCopilotStatus } from "~/lib/copilot/gate.server";
import { toExpiryDate } from "~/lib/date-utils";
import { addCredits, checkBalance } from "~/lib/ledger.server";
import { log, redactId } from "~/lib/logging.server";
import { getMemberRole } from "~/lib/org-supply-settings.server";
import {
	getSubscriber,
	isRevenueCatApiConfigured,
	isRevenueCatFulfillmentEnabled,
	type RevenueCatEntitlementInfo,
} from "~/lib/revenuecat.server";
import {
	type BillingAccountSummary,
	BillingAccountSummarySchema,
	RevenueCatWebhookEventSchema,
} from "~/lib/schemas/billing";
import type { TierSlug } from "~/lib/tiers.server";

export type { BillingAccountSummary };

export type BillingStatus = {
	tier: string;
	entitlements: {
		crew_member: {
			active: boolean;
			expiresAt: string | null;
			store: string | null;
		};
	};
	management: {
		store: string | null;
		url: string | null;
	};
	canPurchaseSubscription: boolean;
	purchaseBlockReason: string | null;
	billingUnavailable: boolean;
};

export type PurchaseGuardResult =
	| { allowed: true }
	| {
			allowed: false;
			reason: string;
			code: (typeof BILLING_ERROR_CODES)[keyof typeof BILLING_ERROR_CODES];
	  };

function crewEntitlementFromSubscriber(
	entitlements: Record<string, RevenueCatEntitlementInfo>,
): RevenueCatEntitlementInfo | null {
	return entitlements[RC_ENTITLEMENT_CREW_MEMBER] ?? null;
}

export async function assertCanPurchaseStripeSubscription(
	env: Env,
	userId: string,
): Promise<PurchaseGuardResult> {
	if (!isRevenueCatApiConfigured(env)) {
		return { allowed: true };
	}

	const subscriber = await getSubscriber(env, userId);
	if (subscriber === null) {
		return {
			allowed: false,
			reason:
				"Unable to verify subscription status right now. Please try again in a few minutes.",
			code: BILLING_ERROR_CODES.BILLING_UNAVAILABLE,
		};
	}

	const crew = crewEntitlementFromSubscriber(subscriber.entitlements);
	if (!crew?.is_active) return { allowed: true };

	const store = crew.store?.toLowerCase() ?? "";
	if (store === "app_store" || store === "mac_app_store") {
		return {
			allowed: false,
			reason:
				"You already have Crew Member via the App Store. Manage your subscription in the App Store or iOS Settings.",
			code: BILLING_ERROR_CODES.ACTIVE_APP_STORE_SUB,
		};
	}

	return { allowed: true };
}

export async function getBillingStatusForUser(
	env: Env,
	userId: string,
	localTier: string,
): Promise<BillingStatus> {
	if (!isRevenueCatApiConfigured(env)) {
		return {
			tier: localTier,
			entitlements: {
				crew_member: {
					active: localTier === "crew_member",
					expiresAt: null,
					store: null,
				},
			},
			management: { store: null, url: null },
			canPurchaseSubscription: true,
			purchaseBlockReason: null,
			billingUnavailable: false,
		};
	}

	const subscriber = await getSubscriber(env, userId);
	if (subscriber === null) {
		return {
			tier: localTier,
			entitlements: {
				crew_member: {
					active: localTier === "crew_member",
					expiresAt: null,
					store: null,
				},
			},
			management: { store: null, url: null },
			canPurchaseSubscription: false,
			purchaseBlockReason:
				"Unable to load billing status. Pull to refresh or try again shortly.",
			billingUnavailable: true,
		};
	}

	const crew = crewEntitlementFromSubscriber(subscriber.entitlements);
	const crewActive = crew?.is_active === true || localTier === "crew_member";
	const purchaseCheck = await assertCanPurchaseStripeSubscription(env, userId);

	return {
		tier: localTier,
		entitlements: {
			crew_member: {
				active: crewActive,
				expiresAt: crew?.expires_date ?? null,
				store: crew?.store ?? null,
			},
		},
		management: {
			store: crew?.store ?? null,
			url: crew?.management_url ?? subscriber.management_url ?? null,
		},
		canPurchaseSubscription: purchaseCheck.allowed,
		purchaseBlockReason: purchaseCheck.allowed ? null : purchaseCheck.reason,
		billingUnavailable: false,
	};
}

export type RevenueCatWebhookResult = {
	handled: boolean;
	fulfilled: boolean;
	duplicate?: boolean;
};

/**
 * Process a verified RevenueCat webhook event.
 * Only mutates D1 when REVENUECAT_FULFILLMENT_ENABLED=true (safe rollout default: off).
 */
export async function processRevenueCatWebhookEvent(
	env: Env,
	rawEvent: unknown,
	kv?: KVNamespace,
): Promise<RevenueCatWebhookResult> {
	const parsed = RevenueCatWebhookEventSchema.safeParse(rawEvent);
	if (!parsed.success) {
		log.warn("RevenueCat webhook payload invalid", {
			issues: parsed.error.issues.length,
		});
		return { handled: false, fulfilled: false };
	}

	const event = parsed.data.event;
	const fulfillmentEnabled = isRevenueCatFulfillmentEnabled(env);
	const fulfillmentKey = revenueCatFulfillmentKey(event.id);

	log.info("RevenueCat webhook received", {
		type: event.type,
		eventId: redactId(event.id),
		appUserId: redactId(event.app_user_id),
		fulfillmentEnabled,
	});

	const userId = event.app_user_id;

	// Cancel-at-period-end must update even when fulfillment is off so account
	// delete gating works for App Store subscribers.
	if (event.type === "CANCELLATION") {
		const db = drizzle(env.DB, { schema });
		await db
			.update(schema.user)
			.set({ subscriptionCancelAtPeriodEnd: true })
			.where(eq(schema.user.id, userId));
		if (!fulfillmentEnabled) {
			return { handled: true, fulfilled: true };
		}
	}
	if (event.type === "UNCANCELLATION") {
		const db = drizzle(env.DB, { schema });
		await db
			.update(schema.user)
			.set({ subscriptionCancelAtPeriodEnd: false })
			.where(eq(schema.user.id, userId));
	}

	if (!fulfillmentEnabled) {
		return { handled: true, fulfilled: false };
	}

	const organizationId = await resolveBillingOrganizationId(env, userId);
	const entitlementIds = event.entitlement_ids ?? [];
	const hasCrewEntitlement = entitlementIds.includes(
		RC_ENTITLEMENT_CREW_MEMBER,
	);
	const productId = event.product_id ?? undefined;

	const grantTypes = new Set([
		"INITIAL_PURCHASE",
		"RENEWAL",
		"UNCANCELLATION",
		"PRODUCT_CHANGE",
		"SUBSCRIPTION_EXTENDED",
	]);

	const revokeTypes = new Set(["EXPIRATION"]);

	try {
		if (grantTypes.has(event.type) && hasCrewEntitlement) {
			if (!organizationId) {
				log.error("RevenueCat crew grant missing organization", {
					userId: redactId(userId),
				});
				return { handled: true, fulfilled: false };
			}

			const expiresMs = event.expiration_at_ms;
			const periodEnd =
				typeof expiresMs === "number" && expiresMs > 0
					? new Date(expiresMs)
					: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

			await grantCrewMemberTier(env, {
				userId,
				organizationId,
				periodEnd,
			});

			return { handled: true, fulfilled: true };
		}

		if (revokeTypes.has(event.type) && hasCrewEntitlement) {
			await revokeCrewMemberTier(env, { userId, organizationId });
			return { handled: true, fulfilled: true };
		}

		if (
			event.type === "NON_RENEWING_PURCHASE" ||
			(event.type === "INITIAL_PURCHASE" && !hasCrewEntitlement)
		) {
			const credits = productId ? RC_PRODUCT_CREDITS[productId] : undefined;
			if (credits && organizationId) {
				await addCredits(
					env,
					organizationId,
					userId,
					credits,
					"RevenueCat Credit Pack",
					{ idempotencyKey: fulfillmentKey },
				);
				return { handled: true, fulfilled: true };
			}
		}

		return { handled: true, fulfilled: false };
	} catch (error) {
		if (kv) {
			await clearRevenueCatWebhookProcessed(kv, event.id);
		}
		throw error;
	}
}

function toIsoTimestamp(
	value: Date | number | string | null | undefined,
): string | null {
	const date = toExpiryDate(value);
	return date ? date.toISOString() : null;
}

function hubUrl(origin: string, path: string): string {
	const base = origin.replace(/\/$/, "");
	return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Live billing/account snapshot for MCP and Ask Ration.
 * Scoped to the authenticated user and active organization only.
 */
export async function getBillingAccountSummary(
	env: Env,
	input: { userId: string; organizationId: string },
): Promise<BillingAccountSummary> {
	const origin = (env.BETTER_AUTH_URL ?? "").replace(/\/$/, "");
	const db = drizzle(env.DB, { schema });

	const [userRow, orgRow, userRole, effectiveOrgTier] = await Promise.all([
		db.query.user.findFirst({
			where: eq(schema.user.id, input.userId),
			columns: {
				tier: true,
				tierExpiresAt: true,
				subscriptionCancelAtPeriodEnd: true,
				crewSubscribedAt: true,
				stripeCustomerId: true,
			},
		}),
		db.query.organization.findFirst({
			where: eq(schema.organization.id, input.organizationId),
			columns: { id: true, name: true },
		}),
		getMemberRole(env.DB, input.organizationId, input.userId),
		getGroupTierLimits(env, input.organizationId),
	]);

	if (!userRole) {
		throw new Error("Organization membership not found");
	}

	const rawAccountTier: TierSlug =
		userRow?.tier === "crew_member" ? "crew_member" : "free";
	const { tier: accountTier, isExpired: accountTierExpired } = getEffectiveTier(
		rawAccountTier,
		userRow?.tierExpiresAt ?? null,
	);

	const [credits, billingStatus, copilotStatus] = await Promise.all([
		checkBalance(env, input.organizationId),
		getBillingStatusForUser(env, input.userId, accountTier),
		getCopilotStatus(env, {
			userId: input.userId,
			organizationId: input.organizationId,
			tier: effectiveOrgTier.tier,
		}),
	]);

	const managementUrl = billingStatus.management.url;
	const portalAvailable =
		Boolean(userRow?.stripeCustomerId) || Boolean(managementUrl);

	const summary: BillingAccountSummary = {
		account: {
			tier: accountTier,
			tierExpired: accountTierExpired,
			renewsOrEndsAt: toIsoTimestamp(userRow?.tierExpiresAt ?? null),
			cancelAtPeriodEnd: Boolean(userRow?.subscriptionCancelAtPeriodEnd),
			crewSubscribedAt: toIsoTimestamp(userRow?.crewSubscribedAt ?? null),
		},
		organization: {
			id: input.organizationId,
			name: orgRow?.name ?? "",
			credits,
			effectiveTier: effectiveOrgTier.tier,
			effectiveTierExpired: effectiveOrgTier.isExpired,
			userRole,
		},
		subscription: {
			active: billingStatus.entitlements.crew_member.active,
			store: billingStatus.management.store,
			managementUrl,
			canPurchaseOnWeb: billingStatus.canPurchaseSubscription,
			purchaseBlockReason: billingStatus.purchaseBlockReason,
			billingUnavailable: billingStatus.billingUnavailable,
		},
		actions: {
			pricingUrl: hubUrl(origin, "/hub/pricing"),
			settingsUrl: hubUrl(origin, "/hub/settings"),
			portalAvailable,
		},
		copilot: {
			freeConversationsRemaining: copilotStatus.freeConversationsRemaining,
			creditBalance: copilotStatus.creditBalance,
			autoDeductConsent: copilotStatus.autoDeductConsent,
			tokensPerCredit: copilotStatus.tokensPerCredit,
			sessionMaxTokens: copilotStatus.sessionMaxTokens,
		},
	};

	return BillingAccountSummarySchema.parse(summary);
}

/** Re-export for Stripe legacy fulfillment idempotency keys. */
export { stripeFulfillmentKey };
