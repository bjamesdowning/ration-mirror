import { afterEach, describe, expect, it, vi } from "vitest";
import {
	buildGatewayRequest,
	callGemini,
	classifyGatewayResponse,
	gatewayFailureMessage,
} from "../ai-gateway.server";

const baseEnv = {
	AI_GATEWAY_ACCOUNT_ID: "841fa4c177353aa4844f0c7439b59f86",
	AI_GATEWAY_ID: "ration-gateway",
	CF_AIG_TOKEN: "test-aig-token",
	RATION_ENV: "development",
} as unknown as Cloudflare.Env;

const metadata = {
	organizationId: "org_123",
	userId: "user_456",
};

describe("buildGatewayRequest", () => {
	it("builds scan request with skip-cache and HIGH thinking config", () => {
		const request = buildGatewayRequest(baseEnv, {
			feature: "scan",
			parts: [
				{ inlineData: { mimeType: "image/jpeg", data: "abc" } },
				{ text: "scan prompt" },
			],
			metadata,
		});

		expect(request).not.toBeNull();
		expect(request?.url).toBe(
			"https://gateway.ai.cloudflare.com/v1/841fa4c177353aa4844f0c7439b59f86/ration-gateway/google-ai-studio/v1beta/models/gemini-3.5-flash:generateContent",
		);
		expect(request?.headers["cf-aig-authorization"]).toBe(
			"Bearer test-aig-token",
		);
		expect(request?.headers["cf-aig-skip-cache"]).toBe("true");
		expect(request?.headers["cf-aig-request-timeout"]).toBe("120000");
		expect(request?.headers["cf-aig-max-attempts"]).toBe("2");
		expect(request?.headers["cf-aig-retry-delay"]).toBe("2000");
		expect(request?.headers["cf-aig-backoff"]).toBe("exponential");

		const body = JSON.parse(request?.body ?? "{}") as {
			generationConfig?: {
				thinkingConfig?: { thinkingLevel?: string };
			};
		};
		expect(body.generationConfig?.thinkingConfig?.thinkingLevel).toBe("HIGH");

		const meta = JSON.parse(request?.headers["cf-aig-metadata"] ?? "{}") as {
			organizationId: string;
			userId: string;
			feature: string;
			env: string;
		};
		expect(meta).toEqual({
			organizationId: "org_123",
			userId: "user_456",
			feature: "scan",
			env: "development",
		});
	});

	it("builds import_url request with cache TTL and LOW thinking config", () => {
		const request = buildGatewayRequest(baseEnv, {
			feature: "import_url",
			parts: [{ text: "system" }, { text: "page" }],
			metadata,
		});

		expect(request?.headers["cf-aig-cache-ttl"]).toBe("3600");
		expect(request?.headers["cf-aig-skip-cache"]).toBeUndefined();
		expect(request?.headers["cf-aig-request-timeout"]).toBe("60000");

		const body = JSON.parse(request?.body ?? "{}") as {
			generationConfig?: {
				thinkingConfig?: { thinkingLevel?: string };
			};
		};
		expect(body.generationConfig?.thinkingConfig?.thinkingLevel).toBe("LOW");
	});

	it("returns null when gateway credentials are missing", () => {
		const request = buildGatewayRequest(
			{ ...baseEnv, CF_AIG_TOKEN: "" } as unknown as Cloudflare.Env,
			{
				feature: "scan",
				parts: [{ text: "prompt" }],
				metadata,
			},
		);
		expect(request).toBeNull();
	});
});

describe("classifyGatewayResponse", () => {
	it("maps timeout statuses", () => {
		expect(classifyGatewayResponse(408)).toBe("timeout");
		expect(classifyGatewayResponse(504)).toBe("timeout");
		expect(classifyGatewayResponse(524)).toBe("timeout");
	});

	it("maps rate limit and guardrail responses", () => {
		expect(classifyGatewayResponse(429)).toBe("rate_limited");
		expect(
			classifyGatewayResponse(400, new Headers({ "cf-aig-step": "guardrail" })),
		).toBe("blocked");
		expect(classifyGatewayResponse(451)).toBe("blocked");
	});

	it("defaults unknown failures to error", () => {
		expect(classifyGatewayResponse(500)).toBe("error");
	});
});

describe("gatewayFailureMessage", () => {
	const messages = {
		timeout: "timeout message",
		rateLimited: "rate limited message",
		blocked: "blocked message",
		configMissing: "config missing message",
		error: "error message",
	};

	it("maps each failure reason to the configured copy", () => {
		expect(gatewayFailureMessage("timeout", messages)).toBe("timeout message");
		expect(gatewayFailureMessage("rate_limited", messages)).toBe(
			"rate limited message",
		);
		expect(gatewayFailureMessage("blocked", messages)).toBe("blocked message");
		expect(gatewayFailureMessage("config_missing", messages)).toBe(
			"config missing message",
		);
		expect(gatewayFailureMessage("error", messages)).toBe("error message");
	});
});

describe("callGemini", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("returns model text on success", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					candidates: [{ content: { parts: [{ text: '{"items":[]}' }] } }],
				}),
			}),
		);

		const result = await callGemini(baseEnv, {
			feature: "import_url",
			parts: [{ text: "system" }, { text: "page" }],
			metadata,
		});

		expect(result).toEqual({ ok: true, text: '{"items":[]}' });
	});

	it("returns timeout reason for slow provider responses", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: false,
				status: 504,
				headers: new Headers(),
			}),
		);

		const result = await callGemini(baseEnv, {
			feature: "scan",
			parts: [{ text: "prompt" }],
			metadata,
		});

		expect(result).toEqual({ ok: false, reason: "timeout", status: 504 });
	});

	it("returns rate_limited for spend-limit 429 responses", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: false,
				status: 429,
				headers: new Headers(),
			}),
		);

		const result = await callGemini(baseEnv, {
			feature: "meal_generate",
			parts: [{ text: "prompt" }],
			metadata,
		});

		expect(result).toEqual({ ok: false, reason: "rate_limited", status: 429 });
	});

	it("returns config_missing when gateway env is incomplete", async () => {
		const result = await callGemini(
			{ ...baseEnv, AI_GATEWAY_ID: "" } as unknown as Cloudflare.Env,
			{
				feature: "plan_week",
				parts: [{ text: "prompt" }],
				metadata,
			},
		);

		expect(result).toEqual({ ok: false, reason: "config_missing" });
	});
});
