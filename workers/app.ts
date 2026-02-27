import * as build from "virtual:react-router/server-build";
import { createRequestHandler } from "@react-router/cloudflare";
import { log } from "../app/lib/logging.server";

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

	/**
	 * Scheduled handler — runs on the CRON trigger configured in wrangler.jsonc.
	 * Currently performs:
	 *   - Session table cleanup: deletes expired sessions to prevent unbounded growth.
	 *
	 * Cron: "0 3 * * *" (03:00 UTC daily — low-traffic window)
	 */
	async scheduled(
		_event: ScheduledController,
		env: Env,
		ctx: ExecutionContext,
	) {
		ctx.waitUntil(purgeExpiredSessions(env));
	},
} satisfies ExportedHandler<Env>;

async function purgeExpiredSessions(env: Env): Promise<void> {
	const nowUnix = Math.floor(Date.now() / 1000);
	try {
		const result = await env.DB.prepare(
			"DELETE FROM session WHERE expires_at < ?1;",
		)
			.bind(nowUnix)
			.run();
		const deleted = result.meta?.changes ?? 0;
		if (deleted > 0) {
			log.info("[CRON] Purged expired sessions", { deleted });
		}
	} catch (err) {
		log.error("[CRON] Session purge failed", err);
	}
}
