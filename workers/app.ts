import * as build from "virtual:react-router/server-build";
import { createRequestHandler } from "@react-router/cloudflare";

const handleRequest = createRequestHandler({ build: build as any });

export default {
	fetch(request, env, ctx) {
		console.log("[Worker] Env Keys:", Object.keys(env));
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
