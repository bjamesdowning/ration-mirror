/**
 * Centralized AI model and generation config for Gemini via AI Gateway.
 * Thinking levels are applied per feature (scan, meal-generate, import-url, plan-week).
 */
export const AI_MODEL = "gemini-3.5-flash";

export type ThinkingLevel = "LOW" | "MEDIUM" | "HIGH";

export type GatewayFeature =
	| "scan"
	| "meal_generate"
	| "plan_week"
	| "import_url";

export type GatewayBackoff = "constant" | "linear" | "exponential";

export type GatewayCacheConfig = { skip: true } | { ttlSeconds: number };

export interface GatewayFeatureConfig {
	thinkingLevel: ThinkingLevel;
	requestTimeoutMs: number;
	maxAttempts: number;
	retryDelayMs: number;
	backoff: GatewayBackoff;
	cache: GatewayCacheConfig;
}

/**
 * Per-feature AI Gateway control-plane settings (cf-aig-* headers).
 * Timeouts are set at/above observed p99 for each feature; retries recover
 * transient provider slowness without changing model or auth.
 */
export const GATEWAY_FEATURE_CONFIG: Record<
	GatewayFeature,
	GatewayFeatureConfig
> = {
	scan: {
		thinkingLevel: "HIGH",
		requestTimeoutMs: 120_000,
		maxAttempts: 2,
		retryDelayMs: 2_000,
		backoff: "exponential",
		cache: { skip: true },
	},
	meal_generate: {
		thinkingLevel: "MEDIUM",
		requestTimeoutMs: 90_000,
		maxAttempts: 2,
		retryDelayMs: 2_000,
		backoff: "exponential",
		cache: { skip: true },
	},
	plan_week: {
		thinkingLevel: "MEDIUM",
		requestTimeoutMs: 90_000,
		maxAttempts: 2,
		retryDelayMs: 2_000,
		backoff: "exponential",
		cache: { skip: true },
	},
	import_url: {
		thinkingLevel: "LOW",
		requestTimeoutMs: 60_000,
		maxAttempts: 2,
		retryDelayMs: 1_500,
		backoff: "exponential",
		cache: { ttlSeconds: 3600 },
	},
};

export interface GenerationConfigWithThinking {
	generationConfig: {
		thinkingConfig: {
			thinkingLevel: ThinkingLevel;
			includeThoughts: false;
		};
	};
}

/**
 * Returns generationConfig for Gemini generateContent requests.
 * Pass the thinking level for the feature; omit to use MEDIUM.
 */
export function getGenerationConfig(
	thinkingLevel: ThinkingLevel,
): GenerationConfigWithThinking {
	return {
		generationConfig: {
			thinkingConfig: {
				thinkingLevel,
				includeThoughts: false,
			},
		},
	};
}
