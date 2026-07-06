declare namespace Cloudflare {
	interface Env {
		CF_AIG_TOKEN: string;
		/** Browser Rendering API token (optional); when absent, recipe import falls back to plain fetch */
		CF_BROWSER_RENDERING_TOKEN?: string;
		// Secrets (set via wrangler secret put; not in wrangler.jsonc)
		BETTER_AUTH_SECRET?: string;
		GOOGLE_CLIENT_ID?: string;
		GOOGLE_CLIENT_SECRET?: string;
		GOOGLE_IOS_CLIENT_ID?: string;
		APPLE_APP_BUNDLE_IDENTIFIER?: string;
		APPLE_SERVICES_ID?: string;
		APPLE_TEAM_ID?: string;
		APPLE_KEY_ID?: string;
		APPLE_PRIVATE_KEY?: string;
		STRIPE_SECRET_KEY?: string;
		STRIPE_PUBLISHABLE_KEY?: string;
		STRIPE_WEBHOOK_SECRET?: string;
		/** RevenueCat secret API key — subscriber lookups. */
		REVENUECAT_API_KEY?: string;
		/** RevenueCat Stripe app public API key — sync Stripe purchases into RC. */
		REVENUECAT_STRIPE_PUBLIC_API_KEY?: string;
		/** Bearer token RevenueCat sends on webhooks. */
		REVENUECAT_WEBHOOK_SECRET?: string;
		/** Set to "true" to grant tier/credits from RC webhooks (default: off for safe rollout). */
		REVENUECAT_FULFILLMENT_ENABLED?: string;
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
		/** Shared secret for Intercom Fin Data Connector -> Ration billing endpoint auth. */
		FIN_INTERCOM_CONNECTOR_SECRET?: string;
		/** HS256 secret for Fin MCP per-user delegation JWTs (main + MCP workers). */
		FIN_MCP_DELEGATION_SECRET?: string;
		/** Comma-separated OAuth client IDs allowed to use mcp:delegate + actor_token. */
		FIN_DELEGATION_CLIENT_IDS?: string;
		/** When "false", MCP worker rejects non-API-key credentials. Default: enabled. */
		MCP_OAUTH_ENABLED?: string;
		/** Emergency kill switch JSON, e.g. {"some-flag":false}. */
		FEATURE_FLAG_OVERRIDES?: string;
	}
}

interface Env extends Cloudflare.Env {}
