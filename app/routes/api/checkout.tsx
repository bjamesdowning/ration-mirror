import { requireActiveGroup } from "~/lib/auth.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import { data } from "~/lib/response";
import { CREDIT_PACKS, getStripe } from "~/lib/stripe.server";
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
	const packKey = formData.get("pack") as keyof typeof CREDIT_PACKS;
	const returnUrlPath =
		(formData.get("returnUrl") as string) || "/dashboard/settings";

	// Validate returnUrl to prevent open redirects (simple allowlist or path check)
	// We only allow dashboard paths
	if (!returnUrlPath.startsWith("/dashboard")) {
		throw data({ error: "Invalid return URL" }, { status: 400 });
	}

	if (!packKey || !CREDIT_PACKS[packKey]) {
		throw data({ error: "Invalid credit pack" }, { status: 400 });
	}

	const selectedPack = CREDIT_PACKS[packKey];

	try {
		// 4. Create Stripe Checkout Session (Embedded Mode)
		if (!context.cloudflare.env.STRIPE_SECRET_KEY) {
			console.error("STRIPE_SECRET_KEY missing in checkout action");
			throw data(
				{ error: "Payment system configuration error" },
				{ status: 503 },
			);
		}

		const stripe = getStripe(context.cloudflare.env);

		const session = await stripe.checkout.sessions.create({
			ui_mode: "embedded", // Embedded Checkout
			mode: "payment",
			line_items: [
				{
					price: selectedPack.priceId,
					quantity: 1,
				},
			],
			metadata: {
				userId, // Who triggered it
				organizationId: groupId, // Who gets the credits
				credits: selectedPack.credits.toString(),
			},
			return_url: `${context.cloudflare.env.BETTER_AUTH_URL}${returnUrlPath}?session_id={CHECKOUT_SESSION_ID}`,
		});

		// 5. Return client secret for frontend
		return {
			success: true,
			clientSecret: session.client_secret,
		};
	} catch (error) {
		console.error("Stripe checkout creation failed:", error);
		throw data({ error: "Failed to create checkout session" }, { status: 500 });
	}
}
