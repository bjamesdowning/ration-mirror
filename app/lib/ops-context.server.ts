import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Request/queue-scoped Env slice for Analytics Engine writes.
 * Bound in main + MCP Worker entrypoints so lib hooks can emit without
 * threading `env` through every `handleApiError` / `rateLimitResponse` call.
 */
export type OpsEnv = Pick<Env, "RATION_ANALYTICS">;

const opsEnvStore = new AsyncLocalStorage<OpsEnv>();

export function runWithOpsEnv<T>(env: OpsEnv, fn: () => T): T {
	return opsEnvStore.run(env, fn);
}

export function getOpsAnalytics(): AnalyticsEngineDataset | undefined {
	return opsEnvStore.getStore()?.RATION_ANALYTICS;
}
