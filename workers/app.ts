import { createRequestHandler } from "@react-router/cloudflare";

declare module "react-router" {
	interface AppLoadContext {
		cloudflare: {
			env: Env;
			ctx: ExecutionContext;
		};
	}
}

const requestHandler = createRequestHandler({
	build: () => import("virtual:react-router/server-build"),
	mode: import.meta.env.MODE,
}) as any;

export default {
	async fetch(request, env, ctx) {
		return requestHandler(request, {
			cloudflare: { env, ctx },
		});
	},
} satisfies ExportedHandler<Env>;
