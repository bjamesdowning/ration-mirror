import { describe, expect, it } from "vitest";
import { APP_VERSION } from "../../version";
import { buildAgentFlagContext, buildFlagContext } from "../context.server";

function requestWithCf(url: string, country: string): Request {
	const request = new Request(url);
	Object.defineProperty(request, "cf", { value: { country } });
	return request;
}

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
