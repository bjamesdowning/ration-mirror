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

const handler = createRequestHandler({
	build: () => import("virtual:react-router/server-build"),
	mode: import.meta.env.MODE,
	getLoadContext: ({ request, context }) => ({
		cloudflare: {
			// biome-ignore lint/suspicious/noExplicitAny: Worker context typing
			env: (context as any).cloudflare?.env || {},
			// biome-ignore lint/suspicious/noExplicitAny: Worker context typing
			ctx: (context as any).cloudflare?.ctx || context,
			// biome-ignore lint/suspicious/noExplicitAny: Worker context typing
			cf: (context as any).cloudflare?.cf || request.cf || {},
		},
	}),
});

export default {
	fetch: (request: Request, env: Env, ctx: ExecutionContext) => {
		return handler({
			// biome-ignore lint/suspicious/noExplicitAny: Worker request typing
			request: request as any,
			env,
			params: {},
			waitUntil: ctx.waitUntil.bind(ctx),
			passThroughOnException: ctx.passThroughOnException.bind(ctx),
			next: () => Promise.resolve(new Response(null, { status: 404 })),
			functionPath: "",
			data: {},
		});
	},
};
