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
	}
}
