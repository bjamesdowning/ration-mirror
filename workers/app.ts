import * as build from "virtual:react-router/server-build";
import { createRequestHandler } from "@react-router/cloudflare";
import { log } from "../app/lib/logging.server";
import {
	type MealGenerateQueueMessage,
	runMealGenerateConsumerJob,
} from "../app/lib/meal-generate-consumer.server";
import {
	runScanConsumerJob,
	type ScanQueueMessage,
} from "../app/lib/scan-consumer.server";

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
		const url = new URL(request.url);

		// Browser and tooling probes for well-known paths (e.g. Chrome DevTools,
		// iOS browser detection) are not routed through React Router to avoid
		// "No route matches URL" errors surfacing as visible error pages.
		if (url.pathname.startsWith("/.well-known/")) {
			return new Response(null, { status: 404 });
		}

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
	 * Queue handler — processes messages from ration-scan and ration-meal-generate.
	 * Dispatches to the appropriate consumer based on batch.queue.
	 */
	async queue(batch: MessageBatch, env: Env, _ctx: ExecutionContext) {
		const queueName = batch.queue;
		for (const msg of batch.messages) {
			try {
				const body = msg.body as ScanQueueMessage | MealGenerateQueueMessage;
				if (queueName === "ration-scan") {
					await runScanConsumerJob(env, body as ScanQueueMessage);
				} else if (queueName === "ration-meal-generate") {
					await runMealGenerateConsumerJob(
						env,
						body as MealGenerateQueueMessage,
					);
				} else {
					log.warn("Unknown queue", { queue: queueName });
				}
				msg.ack();
			} catch (err) {
				log.error("Queue consumer error", { queue: queueName, err });
				msg.retry();
			}
		}
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
		ctx.waitUntil(purgeExpiredQueueJobs(env));
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

async function purgeExpiredQueueJobs(env: Env): Promise<void> {
	const nowUnix = Math.floor(Date.now() / 1000);
	try {
		const result = await env.DB.prepare(
			"DELETE FROM queue_job WHERE expires_at < ?1;",
		)
			.bind(nowUnix)
			.run();
		const deleted = result.meta?.changes ?? 0;
		if (deleted > 0) {
			log.info("[CRON] Purged expired queue jobs", { deleted });
		}
	} catch (err) {
		log.error("[CRON] Queue job purge failed", err);
	}
}
