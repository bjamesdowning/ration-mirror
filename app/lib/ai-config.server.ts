/**
 * Centralized AI model and generation config for Gemini via AI Gateway.
 * Per-feature profiles set thinking level, optional media resolution, and
 * max output tokens (scan, meal-generate, import-url, plan-week, nutrition).
 */
export const AI_MODEL = "gemini-3.5-flash-lite";

export type ThinkingLevel = "MINIMAL" | "LOW" | "MEDIUM" | "HIGH";

/** Global generationConfig media resolution (v1beta generateContent enum). */
export type MediaResolution =
	| "MEDIA_RESOLUTION_LOW"
	| "MEDIA_RESOLUTION_MEDIUM"
	| "MEDIA_RESOLUTION_HIGH";

export type GatewayFeature =
	| "scan"
	| "meal_generate"
	| "plan_week"
	| "import_url"
	| "nutrition_estimate";

export type GatewayBackoff = "constant" | "linear" | "exponential";

export type GatewayCacheConfig = { skip: true } | { ttlSeconds: number };

export interface GatewayFeatureConfig {
	thinkingLevel: ThinkingLevel;
	/** Multimodal features only (e.g. scan). Omitted for text-only features. */
	mediaResolution?: MediaResolution;
	maxOutputTokens: number;
	requestTimeoutMs: number;
	maxAttempts: number;
	retryDelayMs: number;
	backoff: GatewayBackoff;
	cache: GatewayCacheConfig;
}

/**
 * Per-feature AI Gateway control-plane settings (cf-aig-* headers) plus
 * Gemini generationConfig profile (thinking / media / output caps).
 * Timeouts are set at/above observed p99 for each feature; retries recover
 * transient provider slowness without changing model or auth.
 */
export const GATEWAY_FEATURE_CONFIG: Record<
	GatewayFeature,
	GatewayFeatureConfig
> = {
	scan: {
		thinkingLevel: "HIGH",
		mediaResolution: "MEDIA_RESOLUTION_HIGH",
		maxOutputTokens: 16_384,
		requestTimeoutMs: 120_000,
		maxAttempts: 2,
		retryDelayMs: 2_000,
		backoff: "exponential",
		cache: { skip: true },
	},
	meal_generate: {
		thinkingLevel: "MEDIUM",
		maxOutputTokens: 8_192,
		requestTimeoutMs: 90_000,
		maxAttempts: 2,
		retryDelayMs: 2_000,
		backoff: "exponential",
		cache: { skip: true },
	},
	plan_week: {
		thinkingLevel: "MEDIUM",
		maxOutputTokens: 8_192,
		requestTimeoutMs: 90_000,
		maxAttempts: 2,
		retryDelayMs: 2_000,
		backoff: "exponential",
		cache: { skip: true },
	},
	import_url: {
		thinkingLevel: "MINIMAL",
		maxOutputTokens: 4_096,
		requestTimeoutMs: 60_000,
		maxAttempts: 2,
		retryDelayMs: 1_500,
		backoff: "exponential",
		cache: { ttlSeconds: 3600 },
	},
	nutrition_estimate: {
		thinkingLevel: "MINIMAL",
		maxOutputTokens: 1_024,
		requestTimeoutMs: 30_000,
		maxAttempts: 2,
		retryDelayMs: 1_000,
		backoff: "exponential",
		cache: { ttlSeconds: 86_400 },
	},
};

export type GenerationProfile = Pick<
	GatewayFeatureConfig,
	"thinkingLevel" | "maxOutputTokens" | "mediaResolution"
>;

export interface GenerationConfigWithThinking {
	generationConfig: {
		thinkingConfig: {
			thinkingLevel: ThinkingLevel;
			includeThoughts: false;
		};
		maxOutputTokens: number;
		mediaResolution?: MediaResolution;
	};
}

/**
 * Returns generationConfig for Gemini generateContent requests from a
 * feature profile (thinking level, output cap, optional media resolution).
 */
export function getGenerationConfig(
	profile: GenerationProfile,
): GenerationConfigWithThinking {
	const generationConfig: GenerationConfigWithThinking["generationConfig"] = {
		thinkingConfig: {
			thinkingLevel: profile.thinkingLevel,
			includeThoughts: false,
		},
		maxOutputTokens: profile.maxOutputTokens,
	};
	if (profile.mediaResolution) {
		generationConfig.mediaResolution = profile.mediaResolution;
	}
	return { generationConfig };
}
