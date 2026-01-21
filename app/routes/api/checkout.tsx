// @ts-nocheck
import { data } from "react-router";
import { requireAuth } from "~/lib/auth.server";
import { CREDIT_PACKS, getStripe } from "~/lib/stripe.server";
import type { Route } from "./+types/checkout";

// Simple in-memory rate limiting (per-worker instance)
// For production: consider using Durable Objects or KV for distributed rate limiting
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10; // 10 requests per minute per user

function checkRateLimit(userId: string): boolean {
	const now = Date.now();
	const userLimit = rateLimitMap.get(userId);

	if (!userLimit || now > userLimit.resetAt) {
		// New window
		rateLimitMap.set(userId, {
			count: 1,
			resetAt: now + RATE_LIMIT_WINDOW_MS,
		});
		return true;
	}

	if (userLimit.count >= RATE_LIMIT_MAX_REQUESTS) {
		return false; // Rate limit exceeded
	}

	userLimit.count++;
	return true;
}

export async function action({ request, context }: Route.ActionArgs) {
	// 1. Authentication
	const { user } = await requireAuth(context, request);
	const userId = user.id;

	// 2. Rate Limiting
	if (!checkRateLimit(userId)) {
		throw data(
			{ error: "Too many checkout requests. Please try again in 1 minute." },
			{ status: 429 },
		);
	}

	// 3. Parse Input
	const formData = await request.formData();
	const packKey = formData.get("pack") as keyof typeof CREDIT_PACKS;

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
				userId, // Critical: bind user to this session for webhook
				credits: selectedPack.credits.toString(),
			},
			return_url: `${context.cloudflare.env.BETTER_AUTH_URL}/dashboard/credits?session_id={CHECKOUT_SESSION_ID}`,
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
