import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Request/queue-scoped Env slice for Analytics Engine writes and log context.
 * Bound in Worker entrypoints so lib hooks can emit without threading `env`
 * through every `handleApiError` / `rateLimitResponse` call.
 */
export type OpsEnv = {
	RATION_ANALYTICS?: AnalyticsEngineDataset;
	CF_VERSION_METADATA?: WorkerVersionMetadata;
};

export type LogHandler = "fetch" | "queue" | "scheduled";

/** Fields merged into every `log.*` object for Workers Logs indexing. */
export type LogContext = {
	cfRay?: string;
	handler?: LogHandler;
	worker?: string;
	queue?: string;
	jobRequestId?: string;
	cron?: string;
	versionId?: string;
	versionTag?: string;
};

type OpsStore = OpsEnv & { log?: LogContext };

const opsEnvStore = new AsyncLocalStorage<OpsStore>();

function compactLogContext(context: LogContext): LogContext | undefined {
	const out: LogContext = {};
	if (context.cfRay) out.cfRay = context.cfRay;
	if (context.handler) out.handler = context.handler;
	if (context.worker) out.worker = context.worker;
	if (context.queue) out.queue = context.queue;
	if (context.jobRequestId) out.jobRequestId = context.jobRequestId;
	if (context.cron) out.cron = context.cron;
	if (context.versionId) out.versionId = context.versionId;
	if (context.versionTag) out.versionTag = context.versionTag;
	return Object.keys(out).length > 0 ? out : undefined;
}

export function runWithOpsEnv<T>(
	env: OpsEnv,
	fn: () => T,
	log?: LogContext,
): T {
	const merged = compactLogContext({
		...log,
		versionId: env.CF_VERSION_METADATA?.id,
		versionTag: env.CF_VERSION_METADATA?.tag,
	});
	return opsEnvStore.run(
		{
			RATION_ANALYTICS: env.RATION_ANALYTICS,
			CF_VERSION_METADATA: env.CF_VERSION_METADATA,
			log: merged,
		},
		fn,
	);
}

export function getOpsAnalytics(): AnalyticsEngineDataset | undefined {
	return opsEnvStore.getStore()?.RATION_ANALYTICS;
}

export function getLogContext(): LogContext | undefined {
	return opsEnvStore.getStore()?.log;
}

export function fetchLogContext(request: Request, worker: string): LogContext {
	return {
		handler: "fetch",
		worker,
		cfRay: request.headers.get("cf-ray") ?? undefined,
	};
}
