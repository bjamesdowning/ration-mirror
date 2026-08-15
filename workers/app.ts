import * as build from "virtual:react-router/server-build";
import { createRequestHandler } from "@react-router/cloudflare";
import { purgeOrphanAgentKitchens } from "../app/lib/agent/orphan-cleanup.server";
import { AI_QUEUE_HANDLERS } from "../app/lib/ai-queue-registry.server";
import { refreshStaleCargoStatuses } from "../app/lib/cargo.server";
import {
	detectAndRecordExpiredCargo,
	purgeExpiredKitchenEvents,
} from "../app/lib/kitchen-events.server";
import { log, redactJobRequestId } from "../app/lib/logging.server";
import {
	purgeExpiredNutritionIntake,
	purgeExpiredNutritionRecomputeJobs,
} from "../app/lib/nutrition/persist.server";
import { repairDueNutritionRecomputeJobs } from "../app/lib/nutrition/recompute-consumer.server";
import { fetchLogContext, runWithOpsEnv } from "../app/lib/ops-context.server";
import { retryFailedPurgeJobs } from "../app/lib/purge-retry-cron.server";
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
	 * Scheduled handler — runs on the CRON trigger configured in wrangler.jsonc.
	 * Currently performs:
	 *   - Session table cleanup: deletes expired sessions to prevent unbounded growth.
	 *   - Queue job cleanup: deletes expired queue_job rows.
	 *   - Orphan agent kitchen purge: 6-month idle pending_claim registrations.
	 *   - Re-engagement emails: users inactive 30+ days (Hub, API, or MCP).
	 *   - Flight Recorder: detect newly expired cargo + purge events past retention
	 *     (also purges expired nutrition_intake in the same retention job family).
	 *   - Cargo status hygiene: refresh write-time status from expiresAt.
	 *
	 * Cron: "0 3 * * *" (03:00 UTC daily — low-traffic window)
	 */
	async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
		const cronLog = {
			handler: "scheduled" as const,
			worker: "ration",
			cron: event.cron,
		};
		const runCron = (fn: () => Promise<unknown>) =>
			ctx.waitUntil(runWithOpsEnv(env, fn, cronLog));

		if (event.cron === "* * * * *") {
			runCron(() => repairDueNutritionRecomputeJobs(env));
			runCron(() =>
				purgeExpiredNutritionIntake(env.DB, new Date()).catch((err) => {
					log.error("[CRON] Nutrition intake purge failed", err, {
						event: "cron_purge_failed",
					});
				}),
			);
			runCron(() =>
				purgeExpiredNutritionRecomputeJobs(env.DB, new Date()).catch((err) => {
					log.error("[CRON] Nutrition recompute job purge failed", err, {
						event: "cron_purge_failed",
					});
				}),
			);
			return;
		}
		runCron(() => purgeExpiredSessions(env));
		runCron(() => purgeExpiredQueueJobs(env));
		runCron(() => purgeOrphanAgentKitchens(env));
		runCron(() => sendReengagementEmails(env));
		runCron(() => retryFailedPurgeJobs(env));
		runCron(() => runKitchenEventExpiryDetection(env));
		runCron(() => runKitchenEventRetentionPurge(env));
		runCron(() => runCargoStatusRefresh(env));
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
		log.error("[CRON] Session purge failed", err, {
			event: "cron_purge_failed",
		});
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
		log.error("[CRON] Queue job purge failed", err, {
			event: "cron_purge_failed",
		});
	}
}

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
	// Nutrition intake + recompute-job retention run on the minute cron (bounded batches).
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
