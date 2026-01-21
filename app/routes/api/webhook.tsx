// @ts-nocheck

import { processCheckoutSession } from "~/lib/ledger.server";
import { getStripe } from "~/lib/stripe.server";
import type { Route } from "./+types/webhook";

// Track processed events to prevent replay attacks
const processedEvents = new Set<string>();
const EVENT_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

// Cleanup old events periodically
function cleanupProcessedEvents() {
	// In a real production setup, use KV or Durable Objects for distributed tracking
	// This simple implementation works for single-worker instances
	if (processedEvents.size > 10000) {
		processedEvents.clear(); // Prevent memory leak
	}
}

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
			console.warn(`Stale webhook event rejected: ${event.id}`);
			return new Response("Event too old", { status: 400 });
		}

		// 4. Idempotency: Check if event already processed
		if (processedEvents.has(event.id)) {
			console.warn(`Duplicate webhook event: ${event.id}`);
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

			// Mark event as processed
			processedEvents.add(event.id);
			cleanupProcessedEvents();

			console.log(
				`✅ Added ${result.credits} credits to user ${result.userId} (session: ${session.id})`,
			);
		}

		return new Response("Webhook processed", { status: 200 });
	} catch (error) {
		console.error("Webhook processing failed:", error);

		// Don't expose internal errors to Stripe
		if (error instanceof Error && error.message.includes("signature")) {
			return new Response("Invalid signature", { status: 400 });
		}

		return new Response("Webhook processing failed", { status: 500 });
	}
}
