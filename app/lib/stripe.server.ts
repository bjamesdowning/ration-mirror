import Stripe from "stripe";

/**
 * Initialize Stripe SDK with secret key from environment
 */
export function getStripe(env: Env): Stripe {
	if (!env.STRIPE_SECRET_KEY) {
		throw new Error("STRIPE_SECRET_KEY not configured");
	}

	return new Stripe(env.STRIPE_SECRET_KEY, {
		apiVersion: "2025-12-15.clover",
		typescript: true,
		httpClient: Stripe.createFetchHttpClient(),
	});
}

/**
 * Credit pack price IDs (map to Stripe Dashboard prices)
 * These should match the price IDs you created in your Stripe Dashboard
 */
export const CREDIT_PACKS = {
	TASTE_TEST: {
		credits: 15,
		displayName: "Taste Test",
		description: "~7 scans or generations",
		price: "€0.99",
		badge: null,
	},
	SUPPLY_RUN: {
		credits: 60,
		displayName: "Supply Run",
		description: "~30 scans or generations",
		price: "€4.99",
		badge: "Most Popular",
	},
	MISSION_CRATE: {
		credits: 150,
		displayName: "Mission Crate",
		description: "~75 scans or generations",
		price: "€9.99",
		badge: "Best Value",
	},
	ORBITAL_STOCKPILE: {
		credits: 500,
		displayName: "Orbital Stockpile",
		description: "~250 scans or generations",
		price: "€24.99",
		badge: null,
	},
} as const;

export const SUBSCRIPTION_PRODUCTS = {
	CREW_MEMBER_ANNUAL: {
		tier: "crew_member",
		displayName: "Crew Member",
		price: "€12/year",
		creditsOnStart: 60,
		creditsOnRenewal: 60,
	},
} as const;

export const PROMO_CODES = {
	WELCOME60: {
		code: "WELCOME60",
		appliesToPack: "SUPPLY_RUN",
	},
} as const;

export function getCreditPackPriceId(
	env: Env,
	packKey: keyof typeof CREDIT_PACKS,
): string {
	const map: Record<keyof typeof CREDIT_PACKS, string> = {
		TASTE_TEST: env.STRIPE_PRICE_TASTE_TEST,
		SUPPLY_RUN: env.STRIPE_PRICE_SUPPLY_RUN,
		MISSION_CRATE: env.STRIPE_PRICE_MISSION_CRATE,
		ORBITAL_STOCKPILE: env.STRIPE_PRICE_ORBITAL_STOCKPILE,
	};
	const priceId = map[packKey];
	if (!priceId) {
		throw new Error(`Missing Stripe price ID for credit pack: ${packKey}`);
	}
	return priceId;
}

export function getSubscriptionPriceId(
	env: Env,
	productKey: keyof typeof SUBSCRIPTION_PRODUCTS,
): string {
	const map: Record<keyof typeof SUBSCRIPTION_PRODUCTS, string> = {
		CREW_MEMBER_ANNUAL: env.STRIPE_PRICE_CREW_MEMBER_ANNUAL,
	};
	const priceId = map[productKey];
	if (!priceId) {
		throw new Error(`Missing Stripe price ID for subscription: ${productKey}`);
	}
	return priceId;
}

export function getPromotionCodeId(
	env: Env,
	promoKey: keyof typeof PROMO_CODES,
): string {
	const map: Record<keyof typeof PROMO_CODES, string> = {
		WELCOME60: env.STRIPE_PROMO_WELCOME60,
	};
	const promoId = map[promoKey];
	if (!promoId) {
		throw new Error(`Missing Stripe promotion code ID for promo: ${promoKey}`);
	}
	return promoId;
}

/**
 * Reverse lookup: Price ID → Credit amount
 */
export function getCreditsForPriceId(env: Env, priceId: string): number | null {
	const packKeys = Object.keys(CREDIT_PACKS) as Array<
		keyof typeof CREDIT_PACKS
	>;
	for (const packKey of packKeys) {
		if (getCreditPackPriceId(env, packKey) === priceId) {
			return CREDIT_PACKS[packKey].credits;
		}
	}
	return null;
}
