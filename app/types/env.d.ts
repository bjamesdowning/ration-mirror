declare namespace Cloudflare {
	interface Env {
		CF_AIG_TOKEN: string;
		/** Browser Rendering API token (optional); when absent, recipe import falls back to plain fetch */
		CF_BROWSER_RENDERING_TOKEN?: string;
		// Secrets (set via wrangler secret put; not in wrangler.jsonc)
		BETTER_AUTH_SECRET?: string;
		STRIPE_SECRET_KEY?: string;
		STRIPE_PUBLISHABLE_KEY?: string;
		STRIPE_WEBHOOK_SECRET?: string;
		// Stripe price IDs (production: _usd/_eur; dev: single-currency legacy)
		STRIPE_PRICE_TASTE_TEST_usd?: string;
		STRIPE_PRICE_TASTE_TEST_eur?: string;
		STRIPE_PRICE_SUPPLY_RUN_usd?: string;
		STRIPE_PRICE_SUPPLY_RUN_eur?: string;
		STRIPE_PRICE_MISSION_CRATE_usd?: string;
		STRIPE_PRICE_MISSION_CRATE_eur?: string;
		STRIPE_PRICE_ORBITAL_STOCKPILE_usd?: string;
		STRIPE_PRICE_ORBITAL_STOCKPILE_eur?: string;
		STRIPE_PRICE_CREW_MEMBER_ANNUAL_usd?: string;
		STRIPE_PRICE_CREW_MEMBER_ANNUAL_eur?: string;
		STRIPE_PRICE_CREW_MEMBER_MONTHLY_usd?: string;
		STRIPE_PRICE_CREW_MEMBER_MONTHLY_eur?: string;
		STRIPE_PRICE_TASTE_TEST?: string;
		STRIPE_PRICE_SUPPLY_RUN?: string;
		STRIPE_PRICE_MISSION_CRATE?: string;
		STRIPE_PRICE_ORBITAL_STOCKPILE?: string;
		STRIPE_PRICE_CREW_MEMBER_ANNUAL?: string;
		STRIPE_PRICE_CREW_MEMBER_MONTHLY?: string;
		STRIPE_PROMO_WELCOME65?: string;
		/** Public Intercom workspace app id (wrangler vars). */
		INTERCOM_APP_ID?: string;
		/** Intercom Messenger Security — HS256 JWT signing secret. `wrangler secret put INTERCOM_MESSENGER_JWT_SECRET` */
		INTERCOM_MESSENGER_JWT_SECRET?: string;
		/**
		 * Deprecated: legacy HMAC `user_hash` identity verification. Replaced by
		 * `INTERCOM_MESSENGER_JWT_SECRET` and `intercom_user_jwt`. Remove after migration.
		 */
		INTERCOM_IDENTITY_VERIFICATION_SECRET?: string;
	}
}
