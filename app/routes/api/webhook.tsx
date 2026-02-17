import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "~/db/schema";
import { checkStripeWebhookProcessed } from "~/lib/idempotency.server";
import {
	downgradeExpiredSubscription,
	processCheckoutSession,
	processSubscriptionCheckoutSession,
	processSubscriptionInvoice,
} from "~/lib/ledger.server";
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

	const webhookSecret = context.cloudflare.env.STRIPE_WEBHOOK_SECRET;
	if (!webhookSecret) {
		return new Response("Webhook not configured", { status: 503 });
	}

	try {
		// 2. Verify webhook signature
		const event = stripe.webhooks.constructEvent(
			body,
			signature,
			webhookSecret,
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

		if (event.type === "checkout.session.completed") {
			const session = event.data.object;
			const metadataType = session.metadata?.type ?? "credits";

			if (metadataType === "subscription") {
				const result = await processSubscriptionCheckoutSession(
					context.cloudflare.env,
					session.id,
				);
				log.info("Subscription started", {
					userId: redactId(result.userId),
					organizationId: redactId(result.organizationId),
					sessionId: redactId(session.id),
					eventId: redactId(event.id),
				});
			} else {
				const result = await processCheckoutSession(
					context.cloudflare.env,
					session.id,
				);
				if (
					session.metadata?.pack === "SUPPLY_RUN" &&
					session.amount_total === 0 &&
					result.userId
				) {
					const db = drizzle(context.cloudflare.env.DB, { schema });
					await db
						.update(schema.user)
						.set({ welcomeVoucherRedeemed: true })
						.where(eq(schema.user.id, result.userId));
				}
				log.info("Added credits from checkout", {
					credits: result.credits,
					userId: redactId(result.userId),
					sessionId: redactId(session.id),
					eventId: redactId(event.id),
				});
			}
		}

		if (event.type === "invoice.paid") {
			const invoice = event.data.object;
			const invoiceSubscription = (
				invoice as unknown as { subscription?: string }
			).subscription;
			if (invoiceSubscription && typeof invoiceSubscription === "string") {
				const renewal = await processSubscriptionInvoice(
					context.cloudflare.env,
					invoiceSubscription,
					invoice.id,
				);
				log.info("Subscription invoice processed", {
					userId: redactId(renewal.userId),
					organizationId: redactId(renewal.organizationId),
					invoiceId: redactId(invoice.id),
					eventId: redactId(event.id),
				});
			}
		}

		if (event.type === "customer.subscription.deleted") {
			const subscription = event.data.object;
			const result = await downgradeExpiredSubscription(
				context.cloudflare.env,
				subscription.id,
			);
			log.info("Subscription downgraded", {
				userId: redactId(result.userId),
				subscriptionId: redactId(subscription.id),
				eventId: redactId(event.id),
			});
		}

		if (event.type === "customer.subscription.updated") {
			const subscription = event.data.object;
			if (
				subscription.status === "canceled" ||
				subscription.cancel_at_period_end
			) {
				log.info("Subscription updated", {
					subscriptionId: redactId(subscription.id),
					status: subscription.status,
					eventId: redactId(event.id),
				});
			}
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
