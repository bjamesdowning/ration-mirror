import { checkStripeWebhookProcessed } from "~/lib/idempotency.server";
import { processCheckoutSession } from "~/lib/ledger.server";
import { log, redactId } from "~/lib/logging.server";
import { getStripe } from "~/lib/stripe.server";
import type { Route } from "./+types/webhook";

const EVENT_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

export async function action({ request, context }: Route.ActionArgs) {
	const stripe = getStripe(context.cloudflare.env);

	// 1. Get raw body and signature
	const body = await request.text();
	const signature = request.headers.get("stripe-signature");

	if (!signature) {
		return new Response("Missing signature", { status: 400 });
	}

	try {
		// 2. Verify webhook signature
		const event = stripe.webhooks.constructEvent(
			body,
			signature,
			context.cloudflare.env.STRIPE_WEBHOOK_SECRET,
		);

		// 3. Check event timestamp for replay protection
		const eventTimestamp = event.created * 1000; // Convert to milliseconds
		const now = Date.now();

		if (now - eventTimestamp > EVENT_EXPIRY_MS) {
			log.warn("Stale webhook event rejected", { eventId: redactId(event.id) });
			return new Response("Event too old", { status: 400 });
		}

		// 4. Idempotency: Check if event already processed (Distributed via KV)
		const idempotencyCheck = await checkStripeWebhookProcessed(
			context.cloudflare.env.RATION_KV,
			event.id,
		);

		if (idempotencyCheck.alreadyProcessed) {
			log.warn("Duplicate webhook event", {
				eventId: redactId(event.id),
				processedAt: idempotencyCheck.record?.processedAt,
			});
			return new Response("Event already processed", { status: 200 });
		}

		// 5. Handle checkout.session.completed
		if (event.type === "checkout.session.completed") {
			const session = event.data.object;

			// Use shared fulfillment logic (fetches fresh session & is idempotent)
			const result = await processCheckoutSession(
				context.cloudflare.env,
				session.id,
			);

			log.info("Added credits from checkout", {
				credits: result.credits,
				userId: redactId(result.userId),
				sessionId: redactId(session.id),
				eventId: redactId(event.id),
			});
		}

		return new Response("Webhook processed", { status: 200 });
	} catch (error) {
		log.error("Webhook processing failed", error);

		// Don't expose internal errors to Stripe
		if (error instanceof Error && error.message.includes("signature")) {
			return new Response("Invalid signature", { status: 400 });
		}

		return new Response("Webhook processing failed", { status: 500 });
	}
}
