import { describe, expect, it } from "vitest";
import { APP_VERSION } from "~/lib/version";
import {
	resolveAgentFlagContext,
	resolveAgentSurface,
} from "../agent-flag-context";
import type { McpToolContext } from "../auth";

function ctx(overrides: Partial<McpToolContext> = {}): McpToolContext {
	return {
		organizationId: "org-1",
		userId: "user-1",
		scopes: ["mcp:read"],
		authMethod: "oauth",
		apiKeyId: "copilot:user-1",
		keyName: "Ration Copilot",
		keyPrefix: "copilot_",
		preClaim: false,
		...overrides,
	};
}

describe("resolveAgentSurface", () => {
	it("defaults to mcp", () => {
		expect(resolveAgentSurface(ctx())).toBe("mcp");
	});

	it("returns copilot when set", () => {
		expect(resolveAgentSurface(ctx({ agentSurface: "copilot" }))).toBe(
			"copilot",
		);
	});
});

describe("resolveAgentFlagContext", () => {
	it("keeps MCP on mcp + APP_VERSION even if originating iOS is present", () => {
		const context = resolveAgentFlagContext(
			{ RATION_ENV: "production" },
			ctx({
				originatingClient: {
					clientPlatform: "ios",
					clientVersion: "1.4.26",
				},
			}),
		);
		expect(context.clientPlatform).toBe("mcp");
		expect(context.clientVersion).toBe(APP_VERSION);
	});

	it("inherits originating iOS for Copilot tools", () => {
		const context = resolveAgentFlagContext(
			{},
			ctx({
				agentSurface: "copilot",
				originatingClient: {
					clientPlatform: "ios",
					clientVersion: "1.4.26",
				},
			}),
		);
		expect(context.clientPlatform).toBe("ios");
		expect(context.clientVersion).toBe("1.4.26");
		expect(context.userId).toBe("user-1");
	});

	it("inherits originating web for Copilot tools", () => {
		const context = resolveAgentFlagContext(
			{},
			ctx({
				agentSurface: "copilot",
				originatingClient: {
					clientPlatform: "web",
					clientVersion: APP_VERSION,
				},
			}),
		);
		expect(context.clientPlatform).toBe("web");
		expect(context.clientVersion).toBe(APP_VERSION);
	});
});
