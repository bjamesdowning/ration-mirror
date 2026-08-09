import { RC_ENTITLEMENT_CREW_MEMBER } from "~/lib/billing.constants";
import { recordLastActiveBillingOrg } from "~/lib/billing-idempotency.server";
import { log, redactId } from "~/lib/logging.server";

const RC_API_BASE = "https://api.revenuecat.com/v1";

export type RevenueCatEntitlementInfo = {
	identifier: string;
	is_active: boolean;
	expires_date: string | null;
	product_identifier: string;
	store?: string;
	management_url?: string | null;
};

/** Per-product subscription row from GET /v1/subscribers. */
export type RevenueCatSubscriptionInfo = {
	expires_date?: string | null;
	unsubscribe_detected_at?: string | null;
	store?: string | null;
};

export type RevenueCatSubscriber = {
	entitlements: Record<string, RevenueCatEntitlementInfo>;
	subscriptions: Record<string, RevenueCatSubscriptionInfo>;
	management_url?: string | null;
};

type RevenueCatSubscriberResponse = {
	subscriber: {
		entitlements?: Record<string, RevenueCatEntitlementInfo>;
		subscriptions?: Record<string, RevenueCatSubscriptionInfo>;
		management_url?: string | null;
	};
};

export function isRevenueCatApiConfigured(env: Env): boolean {
	return Boolean(env.REVENUECAT_API_KEY);
}

export function isRevenueCatStripeSyncConfigured(env: Env): boolean {
	return Boolean(env.REVENUECAT_STRIPE_PUBLIC_API_KEY);
}

/** When true, RevenueCat webhooks grant tier/credits in D1. Default off for safe rollout. */
export function isRevenueCatFulfillmentEnabled(env: Env): boolean {
	return env.REVENUECAT_FULFILLMENT_ENABLED === "true";
}

export function verifyRevenueCatWebhookAuth(
	request: Request,
	env: Env,
): boolean {
	const secret = env.REVENUECAT_WEBHOOK_SECRET;
	if (!secret) return false;
	const header = request.headers.get("Authorization");
	if (!header?.startsWith("Bearer ")) return false;
	const token = header.slice("Bearer ".length).trim();
	return token.length > 0 && token === secret;
}

/**
 * True when the Crew entitlement's backing subscription has
 * `unsubscribe_detected_at` set (cancelled / will not renew, may still be active).
 */
export function crewCancelAtPeriodEndFromSubscriber(
	subscriber: RevenueCatSubscriber,
): boolean {
	const crew = subscriber.entitlements[RC_ENTITLEMENT_CREW_MEMBER];
	if (!crew) return false;

	const productId = crew.product_identifier;
	if (!productId) return false;

	const subscription = subscriber.subscriptions[productId];
	if (!subscription) return false;

	const unsubscribed = subscription.unsubscribe_detected_at;
	return typeof unsubscribed === "string" && unsubscribed.trim().length > 0;
}

/** Crew entitlement expires_date when present (ISO), else null. */
export function crewExpiresAtFromSubscriber(
	subscriber: RevenueCatSubscriber,
): string | null {
	const crew = subscriber.entitlements[RC_ENTITLEMENT_CREW_MEMBER];
	const expires = crew?.expires_date;
	return typeof expires === "string" && expires.length > 0 ? expires : null;
}

export async function getSubscriber(
	env: Env,
	appUserId: string,
): Promise<RevenueCatSubscriber | null> {
	if (!isRevenueCatApiConfigured(env)) return null;

	const response = await fetch(
		`${RC_API_BASE}/subscribers/${encodeURIComponent(appUserId)}`,
		{
			headers: {
				Authorization: `Bearer ${env.REVENUECAT_API_KEY}`,
				"Content-Type": "application/json",
			},
		},
	);

	if (response.status === 404) {
		return { entitlements: {}, subscriptions: {} };
	}

	if (!response.ok) {
		log.warn("RevenueCat getSubscriber failed", {
			appUserId: redactId(appUserId),
			status: response.status,
		});
		return null;
	}

	const body = (await response.json()) as RevenueCatSubscriberResponse;
	return {
		entitlements: body.subscriber?.entitlements ?? {},
		subscriptions: body.subscriber?.subscriptions ?? {},
		management_url: body.subscriber?.management_url ?? null,
	};
}

/**
 * Set custom subscriber attributes via REST (secret key).
 * Used so Stripe → RC sync carries `organization_id` into subsequent webhooks.
 */
export async function setRevenueCatSubscriberAttributes(
	env: Env,
	appUserId: string,
	attributes: Record<string, string>,
): Promise<boolean> {
	if (!isRevenueCatApiConfigured(env)) return false;
	const entries = Object.entries(attributes).filter(
		([, value]) => typeof value === "string" && value.trim().length > 0,
	);
	if (entries.length === 0) return false;

	const updatedAtMs = Date.now();
	const response = await fetch(
		`${RC_API_BASE}/subscribers/${encodeURIComponent(appUserId)}/attributes`,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${env.REVENUECAT_API_KEY}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				attributes: Object.fromEntries(
					entries.map(([key, value]) => [
						key,
						{ value: value.trim(), updated_at_ms: updatedAtMs },
					]),
				),
			}),
		},
	);

	if (!response.ok) {
		log.warn("RevenueCat setSubscriberAttributes failed", {
			appUserId: redactId(appUserId),
			status: response.status,
		});
		return false;
	}
	return true;
}

/**
 * Import a Stripe subscription or checkout session into RevenueCat.
 * @see https://www.revenuecat.com/docs/web/integrations/stripe/track-external-purchases
 */
export async function syncStripePurchase(
	env: Env,
	appUserId: string,
	fetchToken: string,
): Promise<boolean> {
	if (!isRevenueCatStripeSyncConfigured(env)) return false;

	const response = await fetch(`${RC_API_BASE}/receipts`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${env.REVENUECAT_STRIPE_PUBLIC_API_KEY}`,
			"Content-Type": "application/json",
			"X-Platform": "stripe",
		},
		body: JSON.stringify({
			app_user_id: appUserId,
			fetch_token: fetchToken,
		}),
	});

	if (!response.ok) {
		const text = await response.text().catch(() => "");
		log.warn("RevenueCat syncStripePurchase failed", {
			appUserId: redactId(appUserId),
			fetchToken: redactId(fetchToken),
			status: response.status,
			body: text.slice(0, 200),
		});
		return false;
	}

	log.info("RevenueCat Stripe purchase synced", {
		appUserId: redactId(appUserId),
		fetchToken: redactId(fetchToken),
	});
	return true;
}

export type SyncStripePurchaseOptions = {
	/** Checkout / active org — stamped onto RC so credit webhooks route correctly. */
	organizationId?: string | null;
};

/** Best-effort sync — never throws; used from Stripe webhook after existing fulfillment. */
export async function syncStripePurchaseBestEffort(
	env: Env,
	appUserId: string,
	fetchToken: string,
	options?: SyncStripePurchaseOptions,
): Promise<void> {
	if (!appUserId || !fetchToken) return;
	try {
		const organizationId = options?.organizationId?.trim();
		if (organizationId) {
			await setRevenueCatSubscriberAttributes(env, appUserId, {
				organization_id: organizationId,
			});
			try {
				await recordLastActiveBillingOrg(
					env.RATION_KV,
					appUserId,
					organizationId,
				);
			} catch {
				// KV is best-effort; attribute + receipt sync still proceed.
			}
		}
		await syncStripePurchase(env, appUserId, fetchToken);
	} catch (error) {
		log.warn("RevenueCat syncStripePurchaseBestEffort error", {
			appUserId: redactId(appUserId),
			error: error instanceof Error ? error.message : "unknown",
		});
	}
}
