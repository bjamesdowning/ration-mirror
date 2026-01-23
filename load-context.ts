import type { PlatformProxy } from "wrangler";

declare module "react-router" {
	interface AppLoadContext {
		cloudflare: PlatformProxy<Env>;
	}
}
