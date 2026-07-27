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
	crewCancelAtPeriodEndFromSubscriber,
	crewExpiresAtFromSubscriber,
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
	/** True when Crew is active but set to end (cancel-at-period-end). */
	cancelAtPeriodEnd: boolean;
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

function emptyBillingStatus(
	accountTier: string,
	opts: {
		canPurchaseSubscription: boolean;
		purchaseBlockReason: string | null;
		billingUnavailable: boolean;
		cancelAtPeriodEnd?: boolean;
	},
): BillingStatus {
	return {
		tier: accountTier,
		entitlements: {
			crew_member: {
				active: accountTier === "crew_member",
				expiresAt: null,
				store: null,
			},
		},
		management: { store: null, url: null },
		canPurchaseSubscription: opts.canPurchaseSubscription,
		purchaseBlockReason: opts.purchaseBlockReason,
		billingUnavailable: opts.billingUnavailable,
		cancelAtPeriodEnd: opts.cancelAtPeriodEnd ?? false,
	};
}

/**
 * Sync D1 `subscription_cancel_at_period_end` (and optionally `tier_expires_at`)
 * from RevenueCat REST when webhooks lagged or were missed.
 * Returns the reconciled cancel-at-period-end flag (D1 after write, or prior D1 if RC unavailable).
 *
 * Only mutates the cancel flag when RC has a Crew entitlement with a matching
 * subscriptions row — avoids clearing Stripe-managed cancel-at-period-end.
 */
export async function reconcileSubscriptionCancelAtPeriodEnd(
	env: Env,
	userId: string,
): Promise<{ cancelAtPeriodEnd: boolean }> {
	const db = drizzle(env.DB, { schema });
	const userRow = await db.query.user.findFirst({
		where: eq(schema.user.id, userId),
		columns: {
			subscriptionCancelAtPeriodEnd: true,
			tierExpiresAt: true,
		},
	});
	const d1Flag = Boolean(userRow?.subscriptionCancelAtPeriodEnd);

	if (!isRevenueCatApiConfigured(env)) {
		return { cancelAtPeriodEnd: d1Flag };
	}

	const subscriber = await getSubscriber(env, userId);
	if (subscriber === null) {
		return { cancelAtPeriodEnd: d1Flag };
	}

	const crew = subscriber.entitlements[RC_ENTITLEMENT_CREW_MEMBER];
	const productId = crew?.product_identifier;
	const subscription =
		productId && productId.length > 0
			? subscriber.subscriptions[productId]
			: undefined;

	if (!crew || !subscription) {
		return { cancelAtPeriodEnd: d1Flag };
	}

	const rcCancel = crewCancelAtPeriodEndFromSubscriber(subscriber);
	const rcExpiresAt = crewExpiresAtFromSubscriber(subscriber);
	const updates: {
		subscriptionCancelAtPeriodEnd?: boolean;
		tierExpiresAt?: Date;
	} = {};

	if (rcCancel !== d1Flag) {
		updates.subscriptionCancelAtPeriodEnd = rcCancel;
	}

	if (rcExpiresAt) {
		const nextExpiry = new Date(rcExpiresAt);
		if (!Number.isNaN(nextExpiry.getTime())) {
			const currentMs = userRow?.tierExpiresAt
				? new Date(userRow.tierExpiresAt).getTime()
				: null;
			if (currentMs !== nextExpiry.getTime()) {
				updates.tierExpiresAt = nextExpiry;
			}
		}
	}

	if (Object.keys(updates).length > 0) {
		await db.update(schema.user).set(updates).where(eq(schema.user.id, userId));
		log.info("Reconciled subscription cancel-at-period-end from RevenueCat", {
			userId: redactId(userId),
			cancelAtPeriodEnd: rcCancel,
			updatedExpiresAt: Boolean(updates.tierExpiresAt),
		});
	}

	return { cancelAtPeriodEnd: rcCancel };
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

/**
 * Resolve personal Crew purchase / entitlement status for a user.
 *
 * @param accountTier - Authenticated user's effective personal tier from D1
 *   (`user.tier` via `getEffectiveTier`). Never pass organization-owner /
 *   `getGroupTierLimits` tier — household Crew capacity must not appear as a
 *   personal subscription.
 */
export async function getBillingStatusForUser(
	env: Env,
	userId: string,
	accountTier: string,
	options?: {
		/** Skip RC reconcile when the caller already reconciled for this request. */
		skipReconcile?: boolean;
		/** Required when `skipReconcile` is true. */
		cancelAtPeriodEnd?: boolean;
	},
): Promise<BillingStatus> {
	const cancelAtPeriodEnd =
		options?.skipReconcile === true
			? Boolean(options.cancelAtPeriodEnd)
			: (await reconcileSubscriptionCancelAtPeriodEnd(env, userId))
					.cancelAtPeriodEnd;

	if (!isRevenueCatApiConfigured(env)) {
		return emptyBillingStatus(accountTier, {
			canPurchaseSubscription: true,
			purchaseBlockReason: null,
			billingUnavailable: false,
			cancelAtPeriodEnd,
		});
	}

	const subscriber = await getSubscriber(env, userId);
	if (subscriber === null) {
		return emptyBillingStatus(accountTier, {
			canPurchaseSubscription: false,
			purchaseBlockReason:
				"Unable to load billing status. Pull to refresh or try again shortly.",
			billingUnavailable: true,
			cancelAtPeriodEnd,
		});
	}

	const crew = crewEntitlementFromSubscriber(subscriber.entitlements);
	const crewActive = crew?.is_active === true || accountTier === "crew_member";
	const purchaseCheck = await assertCanPurchaseStripeSubscription(env, userId);

	return {
		tier: accountTier,
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
		cancelAtPeriodEnd:
			cancelAtPeriodEnd || crewCancelAtPeriodEndFromSubscriber(subscriber),
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
			renewsOrEndsAt:
				billingStatus.entitlements.crew_member.expiresAt ??
				toIsoTimestamp(userRow?.tierExpiresAt ?? null),
			cancelAtPeriodEnd: billingStatus.cancelAtPeriodEnd,
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
