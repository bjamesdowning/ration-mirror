import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { data } from "react-router";
import type Stripe from "stripe";
import * as schema from "~/db/schema";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { log } from "~/lib/logging.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import { CheckoutFormSchema } from "~/lib/schemas/checkout";
import {
	CREDIT_PACKS,
	getCreditPackPriceId,
	getOrCreateStripeCustomer,
	getStripe,
	getSubscriptionPriceId,
	SUBSCRIPTION_PRODUCTS,
} from "~/lib/stripe.server";
import type { Route } from "./+types/checkout";

export async function action({ request, context }: Route.ActionArgs) {
	// 1. Authentication & Group Context
	const {
		session: { user },
		groupId,
	} = await requireActiveGroup(context, request);
	const userId = user.id;

	// 2. Rate Limiting (Distributed via KV)
	const rateLimitResult = await checkRateLimit(
		context.cloudflare.env.RATION_KV,
		"checkout",
		userId,
	);

	if (!rateLimitResult.allowed) {
		throw data(
			{
				error: "Too many checkout requests. Please try again later.",
				retryAfter: rateLimitResult.retryAfter,
				resetAt: rateLimitResult.resetAt,
			},
			{
				status: 429,
				headers: {
					"Retry-After": rateLimitResult.retryAfter?.toString() || "60",
					"X-RateLimit-Remaining": "0",
					"X-RateLimit-Reset": rateLimitResult.resetAt.toString(),
				},
			},
		);
	}

	// 3. Parse and validate input
	const formData = await request.formData();
	const raw = {
		type: formData.get("type")?.toString() ?? "credits",
		pack: formData.get("pack")?.toString() ?? undefined,
		subscription: formData.get("subscription")?.toString() ?? undefined,
		returnUrl: formData.get("returnUrl")?.toString() ?? "/hub/checkout/return",
	};

	const parsed = CheckoutFormSchema.safeParse(raw);
	if (!parsed.success) {
		return handleApiError(parsed.error);
	}

	const {
		type: checkoutType,
		pack: packKey,
		subscription: subscriptionKey,
		returnUrl: returnUrlPath,
	} = parsed.data;

	try {
		// 4. Create Stripe Checkout Session (Embedded Mode)
		if (!context.cloudflare.env.STRIPE_SECRET_KEY) {
			log.error("STRIPE_SECRET_KEY missing in checkout action");
			throw data(
				{ error: "Payment system configuration error" },
				{ status: 503 },
			);
		}

		const stripe = getStripe(context.cloudflare.env);
		const db = drizzle(context.cloudflare.env.DB, { schema });

		const userRow = await db.query.user.findFirst({
			where: eq(schema.user.id, userId),
			columns: {
				stripeCustomerId: true,
				welcomeVoucherRedeemed: true,
				email: true,
			},
		});

		if (!userRow?.email) {
			throw data(
				{ error: "Account email required for checkout" },
				{ status: 400 },
			);
		}

		const customerId = await getOrCreateStripeCustomer(
			context.cloudflare.env,
			db,
			userId,
			userRow.email,
		);

		if (checkoutType === "subscription" || checkoutType === "tier") {
			// subscriptionKey is validated by schema when type is subscription/tier
			const sub = subscriptionKey;
			if (!sub) {
				throw data(
					{ error: "Subscription required for subscription checkout" },
					{ status: 400 },
				);
			}
			const selectedSubscription = SUBSCRIPTION_PRODUCTS[sub];
			const session = await stripe.checkout.sessions.create({
				ui_mode: "embedded",
				mode: "subscription",
				customer: customerId,
				line_items: [
					{
						price: getSubscriptionPriceId(context.cloudflare.env, sub),
						quantity: 1,
					},
				],
				subscription_data: {
					metadata: {
						userId,
						organizationId: groupId,
						tier: selectedSubscription.tier,
					},
				},
				metadata: {
					type: "subscription",
					userId,
					organizationId: groupId,
					tier: selectedSubscription.tier,
				},
				return_url: `${context.cloudflare.env.BETTER_AUTH_URL}${returnUrlPath}?session_id={CHECKOUT_SESSION_ID}`,
			});

			return {
				success: true,
				clientSecret: session.client_secret,
				sessionId: session.id,
			};
		}

		// packKey is validated by schema when type is credits
		const pack = packKey;
		if (!pack) {
			throw data(
				{ error: "Pack required for credit checkout" },
				{ status: 400 },
			);
		}
		const welcomeVoucherRedeemed = userRow.welcomeVoucherRedeemed ?? false;
		const sessionParams: Stripe.Checkout.SessionCreateParams = {
			ui_mode: "embedded",
			mode: "payment",
			customer: customerId,
			line_items: [
				{
					price: getCreditPackPriceId(context.cloudflare.env, pack),
					quantity: 1,
				},
			],
			allow_promotion_codes: !welcomeVoucherRedeemed,
			metadata: {
				type: "credits",
				userId,
				organizationId: groupId,
				credits: CREDIT_PACKS[pack].credits.toString(),
				pack,
			},
			return_url: `${context.cloudflare.env.BETTER_AUTH_URL}${returnUrlPath}?session_id={CHECKOUT_SESSION_ID}`,
		};

		const session = await stripe.checkout.sessions.create(sessionParams);

		// 5. Return client secret and session ID for frontend (sessionId used for onComplete navigation)
		return {
			success: true,
			clientSecret: session.client_secret,
			sessionId: session.id,
		};
	} catch (error) {
		return handleApiError(error);
	}
}
