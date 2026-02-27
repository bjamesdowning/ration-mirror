import * as build from "virtual:react-router/server-build";
import { createRequestHandler } from "@react-router/cloudflare";
import { log } from "../app/lib/logging.server";

// biome-ignore lint/suspicious/noExplicitAny: Build types are handled by framework
const handleRequest = createRequestHandler({ build: build as any });

/**
 * Security headers applied to every HTML page response.
 *
 * - X-Frame-Options: DENY — blocks clickjacking by preventing iframe embeds
 * - X-Content-Type-Options: nosniff — stops browsers guessing content types,
 *   preventing user-uploaded content from being interpreted as executable script
 * - Referrer-Policy — prevents sensitive URL params (e.g. ?session_id=) from
 *   leaking to third-party origins via the Referer header
 * - Permissions-Policy — explicitly disables APIs the app does not use; an XSS
 *   payload cannot request camera/microphone/geolocation access
 *
 * These are added only to text/html responses so API JSON responses are unaffected.
 */
const SECURITY_HEADERS: Record<string, string> = {
	"X-Frame-Options": "DENY",
	"X-Content-Type-Options": "nosniff",
	"Referrer-Policy": "strict-origin-when-cross-origin",
	"Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

function applySecurityHeaders(response: Response): Response {
	const contentType = response.headers.get("Content-Type") ?? "";
	if (!contentType.includes("text/html")) return response;

	const headers = new Headers(response.headers);
	for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
		headers.set(key, value);
	}
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}

export default {
	async fetch(request, env, ctx) {
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
		const response = await handleRequest(context);
		return applySecurityHeaders(response);
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
