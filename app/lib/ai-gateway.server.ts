/**
 * Centralized Cloudflare AI Gateway client for Gemini generateContent calls.
 * Applies cf-aig-* control-plane headers (retries, timeouts, caching, metadata).
 */
import { extractModelText } from "~/lib/ai.server";
import {
	AI_MODEL,
	GATEWAY_FEATURE_CONFIG,
	type GatewayFeature,
	getGenerationConfig,
} from "~/lib/ai-config.server";
import { emitGeminiInvoke } from "~/lib/telemetry.server";

export type GatewayFailureReason =
	| "config_missing"
	| "timeout"
	| "rate_limited"
	| "blocked"
	| "empty_response"
	| "error";

export type GatewayResult =
	| { ok: true; text: string }
	| { ok: false; reason: GatewayFailureReason; status?: number };

export interface GatewayRequestMetadata {
	organizationId: string;
	userId: string;
}

export type GeminiContentPart =
	| { text: string }
	| { inlineData: { mimeType: string; data: string } };

export interface BuildGatewayRequestOptions {
	feature: GatewayFeature;
	parts: GeminiContentPart[];
	metadata: GatewayRequestMetadata;
}

export interface GatewayRequestPayload {
	url: string;
	headers: Record<string, string>;
	body: string;
}

function buildGatewayUrl(env: Env): string | null {
	const { AI_GATEWAY_ACCOUNT_ID, AI_GATEWAY_ID } = env;
	if (!AI_GATEWAY_ACCOUNT_ID?.trim() || !AI_GATEWAY_ID?.trim()) {
		return null;
	}
	return `https://gateway.ai.cloudflare.com/v1/${AI_GATEWAY_ACCOUNT_ID}/${AI_GATEWAY_ID}/google-ai-studio/v1beta/models/${AI_MODEL}:generateContent`;
}

export function classifyGatewayResponse(
	status: number,
	headers?: Headers,
): GatewayFailureReason {
	if (status === 408 || status === 504 || status === 524) {
		return "timeout";
	}
	if (status === 429) {
		return "rate_limited";
	}
	const step = headers?.get("cf-aig-step")?.toLowerCase() ?? "";
	if (step.includes("guardrail") || status === 451) {
		return "blocked";
	}
	return "error";
}

export function buildGatewayRequest(
	env: Env,
	options: BuildGatewayRequestOptions,
): GatewayRequestPayload | null {
	const url = buildGatewayUrl(env);
	const token = env.CF_AIG_TOKEN?.trim();
	if (!url || !token) {
		return null;
	}

	const config = GATEWAY_FEATURE_CONFIG[options.feature];
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		"cf-aig-authorization": `Bearer ${token}`,
		"cf-aig-request-timeout": String(config.requestTimeoutMs),
		"cf-aig-max-attempts": String(config.maxAttempts),
		"cf-aig-retry-delay": String(config.retryDelayMs),
		"cf-aig-backoff": config.backoff,
		"cf-aig-metadata": JSON.stringify({
			organizationId: options.metadata.organizationId,
			userId: options.metadata.userId,
			feature: options.feature,
			env: env.RATION_ENV ?? "unknown",
		}),
	};

	if ("skip" in config.cache && config.cache.skip) {
		headers["cf-aig-skip-cache"] = "true";
	} else if ("ttlSeconds" in config.cache) {
		headers["cf-aig-cache-ttl"] = String(config.cache.ttlSeconds);
	}

	return {
		url,
		headers,
		body: JSON.stringify({
			contents: [{ parts: options.parts }],
			...getGenerationConfig(config.thinkingLevel),
		}),
	};
}

export interface GatewayFailureMessages {
	timeout: string;
	rateLimited: string;
	blocked: string;
	configMissing: string;
	error: string;
	emptyResponse?: string;
}

export function gatewayFailureMessage(
	reason: GatewayFailureReason,
	messages: GatewayFailureMessages,
): string {
	switch (reason) {
		case "timeout":
			return messages.timeout;
		case "rate_limited":
			return messages.rateLimited;
		case "blocked":
			return messages.blocked;
		case "config_missing":
			return messages.configMissing;
		case "empty_response":
			return messages.emptyResponse ?? messages.error;
		default:
			return messages.error;
	}
}

export async function callGemini(
	env: Env,
	options: BuildGatewayRequestOptions,
): Promise<GatewayResult> {
	const request = buildGatewayRequest(env, options);
	if (!request) {
		emitGeminiInvoke(options.feature, false);
		return { ok: false, reason: "config_missing" };
	}

	const response = await fetch(request.url, {
		method: "POST",
		headers: request.headers,
		body: request.body,
	});

	if (!response.ok) {
		emitGeminiInvoke(options.feature, false);
		return {
			ok: false,
			reason: classifyGatewayResponse(response.status, response.headers),
			status: response.status,
		};
	}

	const payload = (await response.json()) as unknown;
	const text = extractModelText(payload);
	if (!text) {
		emitGeminiInvoke(options.feature, false);
		return { ok: false, reason: "empty_response" };
	}

	emitGeminiInvoke(options.feature, true);
	return { ok: true, text };
}
