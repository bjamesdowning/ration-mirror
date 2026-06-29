/**
 * Shared billing fulfillment idempotency (KV).
 *
 * RevenueCat event IDs are the canonical keys when RC fulfillment is enabled.
 * Stripe event IDs are used only while Stripe still grants directly (rollout phase).
 */

import {
	checkAndMarkProcessed,
	checkProcessed,
	deleteIdempotencyRecord,
} from "~/lib/idempotency.server";

/** 7 days — covers RevenueCat + Stripe retry windows. */
export const BILLING_FULFILLMENT_TTL_SECONDS = 7 * 24 * 60 * 60;

const RC_WEBHOOK_PREFIX = "billing:rc:webhook";
const FULFILL_PREFIX = "billing:fulfill";

export function revenueCatFulfillmentKey(eventId: string): string {
	return `rc:${eventId}`;
}

export function stripeFulfillmentKey(stripeEventId: string): string {
	return `stripe:${stripeEventId}`;
}

export async function checkRevenueCatWebhookProcessed(
	kv: KVNamespace,
	eventId: string,
): Promise<{ alreadyProcessed: boolean }> {
	const result = await checkAndMarkProcessed(
		kv,
		eventId,
		RC_WEBHOOK_PREFIX,
		BILLING_FULFILLMENT_TTL_SECONDS,
		{ source: "revenuecat" },
	);
	return { alreadyProcessed: result.alreadyProcessed };
}

export async function clearRevenueCatWebhookProcessed(
	kv: KVNamespace,
	eventId: string,
): Promise<void> {
	await deleteIdempotencyRecord(kv, eventId, RC_WEBHOOK_PREFIX);
}

export async function isFulfillmentProcessed(
	kv: KVNamespace,
	fulfillmentKey: string,
): Promise<boolean> {
	const record = await checkProcessed(kv, fulfillmentKey, FULFILL_PREFIX);
	return record !== null;
}

export async function markFulfillmentProcessed(
	kv: KVNamespace,
	fulfillmentKey: string,
	metadata?: Record<string, unknown>,
): Promise<void> {
	await checkAndMarkProcessed(
		kv,
		fulfillmentKey,
		FULFILL_PREFIX,
		BILLING_FULFILLMENT_TTL_SECONDS,
		metadata,
	);
}
