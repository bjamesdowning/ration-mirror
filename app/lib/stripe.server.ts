// @ts-nocheck
import Stripe from "stripe";

/**
 * Initialize Stripe SDK with secret key from environment
 */
export function getStripe(env: Env): Stripe {
	if (!env.STRIPE_SECRET_KEY) {
		throw new Error("STRIPE_SECRET_KEY not configured");
	}

	return new Stripe(env.STRIPE_SECRET_KEY, {
		apiVersion: "2024-12-18.acacia",
		typescript: true,
		httpClient: Stripe.createFetchHttpClient(),
	});
}

/**
 * Credit pack price IDs (map to Stripe Dashboard prices)
 * These should match the price IDs you created in your Stripe Dashboard
 */
export const CREDIT_PACKS = {
	SMALL: {
		credits: 50,
		priceId: "price_1Sro6iFX10NMafIYw1GAzNzx", // €5
		displayName: "50 Credits",
		price: "€5",
	},
	LARGE: {
		credits: 500,
		priceId: "price_1Sro7MFX10NMafIYLCsAWKsz", // €40
		displayName: "500 Credits",
		price: "€40",
	},
} as const;

/**
 * Reverse lookup: Price ID → Credit amount
 */
export function getCreditsForPriceId(priceId: string): number | null {
	for (const pack of Object.values(CREDIT_PACKS)) {
		if (pack.priceId === priceId) {
			return pack.credits;
		}
	}
	return null;
}
