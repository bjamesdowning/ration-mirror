import { createRequestHandler } from "@react-router/cloudflare";

declare module "react-router" {
	interface AppLoadContext {
		cloudflare: {
			env: Env;
			ctx: ExecutionContext;
			cf?: IncomingRequestCfProperties;
		};
	}
}

export default createRequestHandler({
	build: () => import("virtual:react-router/server-build"),
	mode: import.meta.env.MODE,
	getLoadContext: ({ request, context }) => ({
		cloudflare: {
			// biome-ignore lint/suspicious/noExplicitAny: Worker context typing
			env: (context as any).cloudflare?.env || {},
			// biome-ignore lint/suspicious/noExplicitAny: Worker context typing
			ctx: (context as any).cloudflare?.ctx || context,
			cf: request.cf || {},
		},
	}),
});
