import type { FlagshipEvaluationContext } from "./context.server";
import { FLAG_REGISTRY, type FlagKey, getClientFlagKey } from "./registry";

function parseFeatureFlagOverrides(env: Env): Record<string, boolean> | null {
	const raw = env.FEATURE_FLAG_OVERRIDES?.trim();
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (
			parsed === null ||
			typeof parsed !== "object" ||
			Array.isArray(parsed)
		) {
			return null;
		}
		const result: Record<string, boolean> = {};
		for (const [key, value] of Object.entries(parsed)) {
			if (typeof value === "boolean") {
				result[key] = value;
			}
		}
		return result;
	} catch {
		return null;
	}
}

function getEnvOverride(env: Env, flag: string): boolean | undefined {
	const overrides = parseFeatureFlagOverrides(env);
	if (!overrides || !(flag in overrides)) return undefined;
	return overrides[flag];
}

async function evaluateFlagBinding(
	env: Env,
	flag: string,
	defaultEnabled: boolean,
	context: FlagshipEvaluationContext,
): Promise<boolean> {
	if (!env.FLAGS) {
		return defaultEnabled;
	}

	try {
		return await env.FLAGS.getBooleanValue(flag, defaultEnabled, context);
	} catch {
		// Local Vite dev / Miniflare may expose FLAGS but require remote execution.
		return defaultEnabled;
	}
}

export async function isFeatureEnabled(
	env: Env,
	flag: string,
	context: FlagshipEvaluationContext,
): Promise<boolean> {
	if (!(flag in FLAG_REGISTRY)) {
		return false;
	}

	const override = getEnvOverride(env, flag);
	if (override !== undefined) {
		return override;
	}

	const entry = FLAG_REGISTRY[flag];
	if (!entry) {
		return false;
	}

	if (!env.FLAGS) {
		return entry.defaultEnabled;
	}

	return evaluateFlagBinding(env, flag, entry.defaultEnabled, context);
}

/** Evaluate all registry flags marked clientVisible — once per request. */
export async function getClientSafeFlags(
	env: Env,
	context: FlagshipEvaluationContext,
): Promise<Record<string, boolean>> {
	const result: Record<string, boolean> = {};
	const flags = Object.keys(FLAG_REGISTRY);

	await Promise.all(
		flags.map(async (flag) => {
			const entry = FLAG_REGISTRY[flag];
			if (!entry?.clientVisible) return;
			const clientKey = getClientFlagKey(flag, entry);
			result[clientKey] = await isFeatureEnabled(env, flag, context);
		}),
	);

	return result;
}

export { buildFlagContext } from "./context.server";
export type { FlagshipEvaluationContext };
export { FLAG_REGISTRY, type FlagKey };
