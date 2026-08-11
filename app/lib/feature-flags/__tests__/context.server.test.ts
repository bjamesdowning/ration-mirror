import { describe, expect, it } from "vitest";
import { APP_VERSION } from "../../version";
import {
	buildAgentFlagContext,
	buildFlagContext,
	buildMobileFlagContext,
	buildSystemFlagContext,
	buildWebFlagContext,
	InvalidRationClientHeaderError,
} from "../context.server";

function requestWithCf(url: string, country: string): Request {
	const request = new Request(url);
	Object.defineProperty(request, "cf", { value: { country } });
	return request;
}

describe("buildWebFlagContext", () => {
	// Root / Hub document loads must use this helper for clientFlags so Flagship
	// `clientPlatform == web` rules match. Never evaluate Hub UI flags via
	// buildFlagContext (browsers omit X-Ration-Client; header is also spoofable).
	it("forces web + APP_VERSION even when header claims ios", () => {
		const request = new Request("https://ration.mayutic.com/", {
			headers: { "X-Ration-Client": "ios/1.3.17" },
		});
		const context = buildWebFlagContext(request, { RATION_ENV: "production" });
		expect(context.clientPlatform).toBe("web");
		expect(context.clientVersion).toBe(APP_VERSION);
		expect(context.country).toBe("unknown");
	});

	it("sets web platform without a client header (Hub document load)", () => {
		const request = new Request("https://ration.mayutic.com/");
		const context = buildWebFlagContext(request, { RATION_ENV: "production" });
		expect(context.clientPlatform).toBe("web");
		expect(context.clientVersion).toBe(APP_VERSION);
		expect(context.environment).toBe("production");
	});
});

describe("buildMobileFlagContext", () => {
	it("forces ios and accepts reported marketing version", () => {
		const request = new Request("https://ration.mayutic.com/", {
			headers: { "X-Ration-Client": "ios/1.3.17" },
		});
		const context = buildMobileFlagContext(request, {
			RATION_ENV: "production",
		});
		expect(context.clientPlatform).toBe("ios");
		expect(context.clientVersion).toBe("1.3.17");
	});

	it("rejects mismatched header platforms", () => {
		const request = new Request("https://ration.mayutic.com/", {
			headers: { "X-Ration-Client": "web/1.8.3" },
		});
		expect(() => buildMobileFlagContext(request, {})).toThrow(
			InvalidRationClientHeaderError,
		);
	});
});

describe("buildSystemFlagContext", () => {
	it("defaults to system surface", () => {
		const context = buildSystemFlagContext(
			{ RATION_ENV: "production" },
			"user-1",
		);
		expect(context.clientPlatform).toBe("system");
		expect(context.userId).toBe("user-1");
		expect(context.environment).toBe("production");
	});
});

describe("buildFlagContext", () => {
	it("includes country from request.cf", () => {
		const request = requestWithCf("https://ration.mayutic.com/", "US");
		const context = buildFlagContext(request, { RATION_ENV: "production" });
		expect(context.country).toBe("US");
		expect(context.environment).toBe("production");
	});

	it("defaults country to unknown when cf is absent", () => {
		const request = new Request("https://ration.mayutic.com/");
		const context = buildFlagContext(request, {});
		expect(context.country).toBe("unknown");
	});

	it("includes userId and isAdmin from session", () => {
		const request = new Request("https://ration.mayutic.com/");
		const context = buildFlagContext(
			request,
			{ RATION_ENV: "development" },
			{
				user: { id: "user-1", isAdmin: true },
			},
		);
		expect(context.userId).toBe("user-1");
		expect(context.isAdmin).toBe("true");
		expect(context.environment).toBe("development");
	});

	it("includes plan when provided", () => {
		const request = new Request("https://ration.mayutic.com/");
		const context = buildFlagContext(request, {}, null, {
			plan: "crew_member",
		});
		expect(context.plan).toBe("crew_member");
	});

	it("parses X-Ration-Client into clientPlatform and clientVersion", () => {
		const request = new Request("https://ration.mayutic.com/", {
			headers: { "X-Ration-Client": "ios/1.3.17" },
		});
		const context = buildFlagContext(request, { RATION_ENV: "production" });
		expect(context.clientPlatform).toBe("ios");
		expect(context.clientVersion).toBe("1.3.17");
	});
});

describe("buildAgentFlagContext", () => {
	it("sets mcp platform and APP_VERSION without inventing ios", () => {
		const context = buildAgentFlagContext(
			{ RATION_ENV: "production" },
			"user-1",
			"mcp",
		);
		expect(context).toEqual({
			clientPlatform: "mcp",
			clientVersion: APP_VERSION,
			environment: "production",
			userId: "user-1",
		});
		expect(context.clientPlatform).not.toBe("ios");
		expect(context.clientVersion).not.toBe("1.3.25");
	});

	it("sets copilot platform", () => {
		const context = buildAgentFlagContext({}, null, "copilot");
		expect(context.clientPlatform).toBe("copilot");
		expect(context.clientVersion).toBe(APP_VERSION);
		expect(context.userId).toBeUndefined();
	});
});
