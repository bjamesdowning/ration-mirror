declare namespace Cloudflare {
	interface Env {
		CF_AIG_TOKEN: string;
		AI_GATEWAY_ACCOUNT_ID: string;
		AI_GATEWAY_ID: string;
		RATION_ENV?: string;
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
		/** When "false", MCP worker rejects non-API-key credentials. Default: enabled. */
		MCP_OAUTH_ENABLED?: string;
		/** Cloudflare AI Search binding used by the copilot worker. */
		AI_SEARCH?: {
			search?: (request: unknown) => Promise<unknown>;
		};
		/** Optional dedicated secret for main-worker-to-copilot DO purge calls. */
		COPILOT_PURGE_SECRET?: string;
		/** Durable Object namespace for Project Think conversations. */
		PROJECT_THINK?: DurableObjectNamespace;
		/** Optional Analytics Engine dataset for copilot metrics. */
		COPILOT_ANALYTICS?: AnalyticsEngineDataset;
		/** MiniMax API key for Copilot OpenAI-compatible transport (wrangler secret). */
		MINIMAX_API_KEY?: string;
		/** Optional Copilot model id (default MiniMax-M3). */
		COPILOT_MODEL_ID?: string;
		/** Optional Copilot OpenAI-compatible base URL (default https://api.minimax.io/v1). */
		COPILOT_BASE_URL?: string;
		/**
		 * Main + MCP Workers Analytics Engine — ops counters (503/429/queue/Gemini).
		 * Dataset: `ration_ops` (prod) / `ration_ops_dev` (dev).
		 */
		RATION_ANALYTICS?: AnalyticsEngineDataset;
		/** Emergency kill switch JSON, e.g. {"some-flag":false}. */
		FEATURE_FLAG_OVERRIDES?: string;
		/** App Review demo login — email must match iOS reveal gate. */
		APP_REVIEW_DEMO_EMAIL?: string;
		/** App Review demo login password (Wrangler secret). */
		APP_REVIEW_DEMO_PASSWORD?: string;
		/** Pre-seeded App Review user id in D1. */
		APP_REVIEW_DEMO_USER_ID?: string;
	}
}

interface Env extends Cloudflare.Env {}
