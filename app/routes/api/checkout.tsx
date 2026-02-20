import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { log } from "~/lib/logging.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import {
	CREDIT_PACKS,
	getCreditPackPriceId,
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

	// 3. Parse Input
	const formData = await request.formData();
	const checkoutType = (formData.get("type") as string) || "credits";
	const packKey = formData.get("pack") as keyof typeof CREDIT_PACKS;
	const subscriptionKey = formData.get(
		"subscription",
	) as keyof typeof SUBSCRIPTION_PRODUCTS;
	const returnUrlPath =
		(formData.get("returnUrl") as string) || "/hub/checkout/return";

	// Validate returnUrl to prevent open redirects (simple allowlist or path check)
	// We only allow dashboard paths
	if (!returnUrlPath.startsWith("/hub")) {
		throw data({ error: "Invalid return URL" }, { status: 400 });
	}

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

		if (checkoutType === "subscription" || checkoutType === "tier") {
			if (!subscriptionKey || !SUBSCRIPTION_PRODUCTS[subscriptionKey]) {
				throw data({ error: "Invalid subscription product" }, { status: 400 });
			}

			const selectedSubscription = SUBSCRIPTION_PRODUCTS[subscriptionKey];
			const session = await stripe.checkout.sessions.create({
				ui_mode: "embedded",
				mode: "subscription",
				line_items: [
					{
						price: getSubscriptionPriceId(
							context.cloudflare.env,
							subscriptionKey,
						),
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

		if (!packKey || !CREDIT_PACKS[packKey]) {
			throw data({ error: "Invalid credit pack" }, { status: 400 });
		}

		const selectedPack = CREDIT_PACKS[packKey];
		const session = await stripe.checkout.sessions.create({
			ui_mode: "embedded", // Embedded Checkout
			mode: "payment",
			line_items: [
				{
					price: getCreditPackPriceId(context.cloudflare.env, packKey),
					quantity: 1,
				},
			],
			allow_promotion_codes: true,
			metadata: {
				type: "credits",
				userId,
				organizationId: groupId,
				credits: selectedPack.credits.toString(),
				pack: packKey,
			},
			return_url: `${context.cloudflare.env.BETTER_AUTH_URL}${returnUrlPath}?session_id={CHECKOUT_SESSION_ID}`,
		});

		// 5. Return client secret and session ID for frontend (sessionId used for onComplete navigation)
		return {
			success: true,
			clientSecret: session.client_secret,
			sessionId: session.id,
		};
	} catch (error) {
		log.error("Stripe checkout creation failed", error);
		throw data({ error: "Failed to create checkout session" }, { status: 500 });
	}
}
