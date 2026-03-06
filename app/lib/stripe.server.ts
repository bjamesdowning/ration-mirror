import { and, eq, isNull } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/d1";
import Stripe from "stripe";
import * as schema from "~/db/schema";

import type { DisplayCurrency } from "~/lib/currency";

export type { DisplayCurrency };

/**
 * Initialize Stripe SDK with secret key from environment
 */
export function getStripe(env: Env): Stripe {
	if (!env.STRIPE_SECRET_KEY) {
		throw new Error("STRIPE_SECRET_KEY not configured");
	}

	return new Stripe(env.STRIPE_SECRET_KEY, {
		apiVersion: "2026-02-25.clover",
		typescript: true,
		httpClient: Stripe.createFetchHttpClient(),
	});
}

/**
 * Credit pack price IDs (map to Stripe Dashboard prices)
 * These should match the price IDs you created in your Stripe Dashboard
 * Option B with rounded numbers: 7% → 27% → 46% volume discount
 */
export const CREDIT_PACKS = {
	TASTE_TEST: {
		credits: 12,
		displayName: "Taste Test",
		description: "~6 scans or generations",
		price: "€1",
		priceUsd: "$1",
		priceEur: "€1",
		badge: null,
	},
	SUPPLY_RUN: {
		credits: 65,
		displayName: "Supply Run",
		description: "~32 scans or generations",
		price: "€5",
		priceUsd: "$5",
		priceEur: "€5",
		badge: "Most Popular",
	},
	MISSION_CRATE: {
		credits: 165,
		displayName: "Mission Crate",
		description: "~82 scans or generations",
		price: "€10",
		priceUsd: "$10",
		priceEur: "€10",
		badge: null,
	},
	ORBITAL_STOCKPILE: {
		credits: 550,
		displayName: "Orbital Stockpile",
		description: "~275 scans or generations",
		price: "€25",
		priceUsd: "$25",
		priceEur: "€25",
		badge: "Best Value",
	},
} as const;

export const SUBSCRIPTION_PRODUCTS = {
	CREW_MEMBER_ANNUAL: {
		tier: "crew_member",
		displayName: "Crew Member (Annual)",
		price: "€12/year",
		priceUsd: "$12/year",
		priceEur: "€12/year",
		creditsOnStart: 65,
		creditsOnRenewal: 65,
		interval: "year" as const,
	},
	CREW_MEMBER_MONTHLY: {
		tier: "crew_member",
		displayName: "Crew Member (Monthly)",
		price: "€2/month",
		priceUsd: "$2/month",
		priceEur: "€2/month",
		creditsOnStart: 0,
		creditsOnRenewal: 0,
		interval: "month" as const,
	},
} as const;

export const PROMO_CODES = {
	WELCOME65: {
		code: "WELCOME65",
		appliesToPack: "SUPPLY_RUN",
	},
} as const;

function isDualCurrencyEnv(env: Env): boolean {
	return (
		typeof (env as { STRIPE_PRICE_TASTE_TEST_eur?: string })
			.STRIPE_PRICE_TASTE_TEST_eur === "string"
	);
}

export function getCreditPackPriceId(
	env: Env,
	packKey: keyof typeof CREDIT_PACKS,
	currency: DisplayCurrency = "EUR",
): string {
	if (isDualCurrencyEnv(env)) {
		const key =
			currency === "USD"
				? (`STRIPE_PRICE_${packKey}_usd` as const)
				: (`STRIPE_PRICE_${packKey}_eur` as const);
		const priceId = (env as unknown as Record<string, string | undefined>)[key];
		if (!priceId) {
			throw new Error(
				`Missing Stripe price ID for credit pack: ${packKey} (${currency})`,
			);
		}
		return priceId;
	}
	const map: Record<keyof typeof CREDIT_PACKS, string> = {
		TASTE_TEST: env.STRIPE_PRICE_TASTE_TEST ?? "",
		SUPPLY_RUN: env.STRIPE_PRICE_SUPPLY_RUN ?? "",
		MISSION_CRATE: env.STRIPE_PRICE_MISSION_CRATE ?? "",
		ORBITAL_STOCKPILE: env.STRIPE_PRICE_ORBITAL_STOCKPILE ?? "",
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
	currency: DisplayCurrency = "EUR",
): string {
	if (isDualCurrencyEnv(env)) {
		const key =
			currency === "USD"
				? (`STRIPE_PRICE_${productKey}_usd` as const)
				: (`STRIPE_PRICE_${productKey}_eur` as const);
		const priceId = (env as unknown as Record<string, string | undefined>)[key];
		if (!priceId) {
			throw new Error(
				`Missing Stripe price ID for subscription: ${productKey} (${currency})`,
			);
		}
		return priceId;
	}
	const map: Record<keyof typeof SUBSCRIPTION_PRODUCTS, string> = {
		CREW_MEMBER_ANNUAL: env.STRIPE_PRICE_CREW_MEMBER_ANNUAL ?? "",
		CREW_MEMBER_MONTHLY: env.STRIPE_PRICE_CREW_MEMBER_MONTHLY ?? "",
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
		WELCOME65: env.STRIPE_PROMO_WELCOME65 ?? "",
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
		if (isDualCurrencyEnv(env)) {
			if (
				getCreditPackPriceId(env, packKey, "USD") === priceId ||
				getCreditPackPriceId(env, packKey, "EUR") === priceId
			) {
				return CREDIT_PACKS[packKey].credits;
			}
		} else if (getCreditPackPriceId(env, packKey) === priceId) {
			return CREDIT_PACKS[packKey].credits;
		}
	}
	return null;
}

/**
 * Returns true if the price ID is for the Crew Member Annual plan (USD or EUR).
 */
export function isAnnualSubscriptionPrice(env: Env, priceId: string): boolean {
	if (!priceId) return false;
	if (isDualCurrencyEnv(env)) {
		const envRecord = env as unknown as Record<string, string | undefined>;
		const annualUsd = envRecord.STRIPE_PRICE_CREW_MEMBER_ANNUAL_usd;
		const annualEur = envRecord.STRIPE_PRICE_CREW_MEMBER_ANNUAL_eur;
		return priceId === annualUsd || priceId === annualEur;
	}
	return priceId === env.STRIPE_PRICE_CREW_MEMBER_ANNUAL;
}

/**
 * Clear a user's stored Stripe customer ID. Use when the customer no longer exists
 * in Stripe (e.g. Test→Live migration) so the next checkout creates a new customer.
 */
export async function clearStripeCustomerId(
	db: ReturnType<typeof drizzle<typeof schema>>,
	userId: string,
): Promise<void> {
	await db
		.update(schema.user)
		.set({ stripeCustomerId: null })
		.where(eq(schema.user.id, userId));
}

/**
 * Returns true if the error indicates the Stripe customer does not exist
 * (e.g. customer was created in Test mode but we're now using Live keys).
 */
export function isStripeNoSuchCustomerError(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	return (
		error.message.includes("No such customer") ||
		(error as { code?: string }).code === "resource_missing"
	);
}

/**
 * Get or create a Stripe Customer for the user.
 * Creates a Customer in Stripe and saves stripeCustomerId to the user if they don't have one.
 * Uses conditional update to avoid race conditions when two checkouts run concurrently.
 */
export async function getOrCreateStripeCustomer(
	env: Env,
	db: ReturnType<typeof drizzle<typeof schema>>,
	userId: string,
	email: string,
): Promise<string> {
	const userRow = await db.query.user.findFirst({
		where: eq(schema.user.id, userId),
		columns: { stripeCustomerId: true },
	});

	if (userRow?.stripeCustomerId) {
		return userRow.stripeCustomerId;
	}

	const stripe = getStripe(env);
	const customer = await stripe.customers.create({
		email,
		metadata: { userId },
	});

	await db
		.update(schema.user)
		.set({ stripeCustomerId: customer.id })
		.where(
			and(eq(schema.user.id, userId), isNull(schema.user.stripeCustomerId)),
		);

	// Another request may have won the race and saved a different customer.
	// Refetch to return the authoritative value.
	const updated = await db.query.user.findFirst({
		where: eq(schema.user.id, userId),
		columns: { stripeCustomerId: true },
	});

	return updated?.stripeCustomerId ?? customer.id;
}
