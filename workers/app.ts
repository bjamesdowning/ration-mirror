import * as build from "virtual:react-router/server-build";
import { createRequestHandler } from "@react-router/cloudflare";
import { purgeOrphanAgentKitchens } from "../app/lib/agent/orphan-cleanup.server";
import { AI_QUEUE_HANDLERS } from "../app/lib/ai-queue-registry.server";
import { refreshStaleCargoStatuses } from "../app/lib/cargo.server";
import { runDailyD1HygieneThenPurgeRetry } from "../app/lib/cron-hygiene.server";
import {
	detectAndRecordExpiredCargo,
	purgeExpiredKitchenEvents,
} from "../app/lib/kitchen-events.server";
import { log, redactJobRequestId } from "../app/lib/logging.server";
import { repairDueNutritionRecomputeJobs } from "../app/lib/nutrition/recompute-consumer.server";
import { fetchLogContext, runWithOpsEnv } from "../app/lib/ops-context.server";
import { sendReengagementEmails } from "../app/lib/reengagement-cron.server";
import { emitQueueConsumerError } from "../app/lib/telemetry.server";
import { isRegisteredWellKnownPath } from "../app/lib/well-known-routes";

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
		return runWithOpsEnv(
			env,
			async () => {
				const url = new URL(request.url);

				// Browser and tooling probes for unknown well-known paths (e.g. Chrome
				// DevTools, iOS browser detection) are not routed through React Router to
				// avoid "No route matches URL" errors surfacing as visible error pages.
				if (
					url.pathname.startsWith("/.well-known/") &&
					!isRegisteredWellKnownPath(url.pathname)
				) {
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
					next: () =>
						Promise.resolve(new Response("Not found", { status: 404 })),
					cloudflare: {
						env,
						ctx,
						cf: request.cf,
					},
				};
				const response = await handleRequest(context);
				return applySecurityHeaders(response);
			},
			fetchLogContext(request, "ration"),
		);
	},

	/**
	 * Queue handler — dispatches to consumers via AI_QUEUE_HANDLERS.
	 * Unknown queues are logged and acked to avoid infinite retries.
	 */
	async queue(batch: MessageBatch, env: Env, _ctx: ExecutionContext) {
		const queueName = batch.queue;
		const handler = AI_QUEUE_HANDLERS[queueName];

		for (const msg of batch.messages) {
			await runWithOpsEnv(
				env,
				async () => {
					try {
						if (handler) {
							await handler(env, msg.body);
							msg.ack();
						} else {
							log.warn("Unknown queue", {
								event: "unknown_queue",
								queue: queueName,
							});
							msg.ack(); // ack to avoid infinite retries
						}
					} catch (err) {
						log.error("Queue consumer error", err, {
							event: "queue_consumer_error",
							queue: queueName,
						});
						emitQueueConsumerError(queueName);
						msg.retry();
					}
				},
				{
					handler: "queue",
					worker: "ration",
					queue: queueName,
					jobRequestId: redactJobRequestId(msg.body),
				},
			);
		}
	},

	/**
	 * Scheduled handler — runs on CRON triggers in wrangler.jsonc.
	 *
	 *   Every 5 minutes — nutrition recompute outbox sweeper (missed wakes /
	 *     expired leases). Awaited in-handler so it is one D1 writer, not
	 *     parallel waitUntil.
	 *   03:00 UTC daily — serialized D1 hygiene (sessions, queue_job, nutrition
	 *     retention, orphan kitchens, Flight Recorder, cargo status) then
	 *     re-engagement email on a separate waitUntil.
	 */
	async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
		const cronLog = {
			handler: "scheduled" as const,
			worker: "ration",
			cron: event.cron,
		};
		const runCron = (fn: () => Promise<unknown>) =>
			ctx.waitUntil(runWithOpsEnv(env, fn, cronLog));

		if (event.cron === "*/5 * * * *") {
			await runWithOpsEnv(
				env,
				async () => {
					try {
						await repairDueNutritionRecomputeJobs(env);
					} catch (err) {
						log.error("[CRON] Nutrition recompute repair failed", err, {
							event: "cron_purge_failed",
						});
					}
				},
				cronLog,
			);
			return;
		}
		runCron(async () => {
			await runDailyD1HygieneThenPurgeRetry(env);
			await purgeOrphanAgentKitchens(env);
			await runKitchenEventExpiryDetection(env);
			await runKitchenEventRetentionPurge(env);
			await runCargoStatusRefresh(env);
		});
		runCron(() => sendReengagementEmails(env));
	},
} satisfies ExportedHandler<Env>;

async function runKitchenEventExpiryDetection(env: Env): Promise<void> {
	try {
		const recorded = await detectAndRecordExpiredCargo(env.DB);
		if (recorded > 0) {
			log.info("[CRON] Recorded cargo_expired events", { recorded });
		}
	} catch (err) {
		log.error("[CRON] Kitchen event expiry detection failed", err, {
			event: "cron_purge_failed",
		});
	}
}

async function runKitchenEventRetentionPurge(env: Env): Promise<void> {
	try {
		const deleted = await purgeExpiredKitchenEvents(env.DB);
		if (deleted > 0) {
			log.info("[CRON] Purged expired kitchen events", { deleted });
		}
	} catch (err) {
		log.error("[CRON] Kitchen event retention purge failed", err, {
			event: "cron_purge_failed",
		});
	}
}

async function runCargoStatusRefresh(env: Env): Promise<void> {
	try {
		const updated = await refreshStaleCargoStatuses(env.DB);
		if (updated > 0) {
			log.info("[CRON] Refreshed stale cargo statuses", { updated });
		}
	} catch (err) {
		log.error("[CRON] Cargo status refresh failed", err, {
			event: "cron_purge_failed",
		});
	}
}
