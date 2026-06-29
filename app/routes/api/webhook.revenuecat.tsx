import { processRevenueCatWebhookEvent } from "~/lib/billing.server";
import { checkRevenueCatWebhookProcessed } from "~/lib/billing-idempotency.server";
import { log, redactId } from "~/lib/logging.server";
import {
	isRevenueCatFulfillmentEnabled,
	verifyRevenueCatWebhookAuth,
} from "~/lib/revenuecat.server";
import { RevenueCatWebhookEventSchema } from "~/lib/schemas/billing";
import type { Route } from "./+types/webhook.revenuecat";

export async function action({ request, context }: Route.ActionArgs) {
	const env = context.cloudflare.env;

	if (!env.REVENUECAT_WEBHOOK_SECRET) {
		return new Response("RevenueCat webhook not configured", { status: 503 });
	}

	if (!verifyRevenueCatWebhookAuth(request, env)) {
		return new Response("Unauthorized", { status: 401 });
	}

	const kv = env.RATION_KV;
	let eventId: string | undefined;

	try {
		const body = (await request.json()) as unknown;
		const parsed = RevenueCatWebhookEventSchema.safeParse(body);
		if (!parsed.success) {
			return new Response("Invalid payload", { status: 400 });
		}

		eventId = parsed.data.event.id;

		if (kv) {
			const idempotency = await checkRevenueCatWebhookProcessed(kv, eventId);
			if (idempotency.alreadyProcessed) {
				log.info("Duplicate RevenueCat webhook skipped", {
					eventId: redactId(eventId),
				});
				return new Response("OK", { status: 200 });
			}
		} else {
			log.warn("RATION_KV not bound; skipping RevenueCat webhook idempotency", {
				eventId: redactId(eventId),
			});
		}

		const result = await processRevenueCatWebhookEvent(env, body, kv);

		if (!result.handled) {
			return new Response("Invalid payload", { status: 400 });
		}

		if (!result.fulfilled && !isRevenueCatFulfillmentEnabled(env)) {
			log.info("RevenueCat webhook acknowledged (fulfillment disabled)");
		}

		return new Response("OK", { status: 200 });
	} catch (error) {
		log.error("RevenueCat webhook processing failed", error, {
			eventId: eventId ? redactId(eventId) : undefined,
		});
		return new Response("Webhook processing failed", { status: 500 });
	}
}
