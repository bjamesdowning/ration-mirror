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

export type RevenueCatSubscriber = {
	entitlements: Record<string, RevenueCatEntitlementInfo>;
	management_url?: string | null;
};

type RevenueCatSubscriberResponse = {
	subscriber: {
		entitlements?: Record<string, RevenueCatEntitlementInfo>;
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
		return { entitlements: {} };
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
		management_url: body.subscriber?.management_url ?? null,
	};
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

/** Best-effort sync — never throws; used from Stripe webhook after existing fulfillment. */
export async function syncStripePurchaseBestEffort(
	env: Env,
	appUserId: string,
	fetchToken: string,
): Promise<void> {
	if (!appUserId || !fetchToken) return;
	try {
		await syncStripePurchase(env, appUserId, fetchToken);
	} catch (error) {
		log.warn("RevenueCat syncStripePurchaseBestEffort error", {
			appUserId: redactId(appUserId),
			error: error instanceof Error ? error.message : "unknown",
		});
	}
}
