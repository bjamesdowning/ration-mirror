import * as build from "virtual:react-router/server-build";
import { createRequestHandler } from "@react-router/cloudflare";

// biome-ignore lint/suspicious/noExplicitAny: Build types are handled by framework
const handleRequest = createRequestHandler({ build: build as any });

export default {
	fetch(request, env, ctx) {
		const context = {
			request,
			env,
			waitUntil: ctx.waitUntil.bind(ctx),
			passThroughOnException: ctx.passThroughOnException.bind(ctx),
			functionPath: "",
			params: {},
			data: {},
			next: () => Promise.resolve(new Response("Not found", { status: 404 })),
			cloudflare: {
				env,
				ctx,
				cf: request.cf,
			},
		};
		return handleRequest(context);
	},
} satisfies ExportedHandler<Env>;
