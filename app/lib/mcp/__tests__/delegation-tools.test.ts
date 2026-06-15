import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { signDelegationToken } from "~/lib/fin-delegation.server";
import { createMockEnv } from "~/test/helpers/mock-env";

const { memberFindFirst } = vi.hoisted(() => ({
	memberFindFirst: vi.fn(),
}));

vi.mock("drizzle-orm/d1", () => ({
	drizzle: vi.fn(() => ({
		query: {
			member: { findFirst: memberFindFirst },
		},
		select: vi.fn().mockReturnThis(),
		from: vi.fn().mockReturnThis(),
		where: vi.fn().mockReturnThis(),
		orderBy: vi.fn().mockResolvedValue([]),
		limit: vi.fn().mockResolvedValue([]),
	})),
}));

vi.mock("~/lib/auth.server", () => ({
	getUserSettings: vi.fn().mockResolvedValue({}),
	patchUserSettings: vi.fn(),
}));

vi.mock("~/lib/cargo.server", () => ({
	getCargoPage: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
	getCargoItem: vi.fn(),
	getCargoByIds: vi.fn(),
	getExpiringCargo: vi.fn().mockResolvedValue([]),
	ingestCargoItems: vi.fn(),
	jettisonItem: vi.fn(),
	updateItem: vi.fn(),
}));

vi.mock("~/lib/rate-limiter.server", () => ({
	checkRateLimit: vi.fn(),
}));

const { registerTools } = await import("../tools");
const { checkRateLimit } = await import("~/lib/rate-limiter.server");
const { getCargoPage } = await import("~/lib/cargo.server");

const SECRET = "test-delegation-secret-32chars-min!!";
const ISSUER = "https://ration.mayutic.com";
const FIN_CLIENT = "fin-client-1";

const RATE_ALLOWED = {
	allowed: true,
	remaining: 10,
	resetAt: Date.now() + 60000,
};

function getToolHandler(server: McpServer, name: string) {
	const tools = (
		server as unknown as {
			_registeredTools: Record<
				string,
				{ handler: (args: unknown) => Promise<unknown> }
			>;
		}
	)._registeredTools;
	const tool = tools[name];
	if (!tool) {
		throw new Error(`Tool ${name} not found`);
	}
	return tool.handler;
}

function makeDelegateServer() {
	const orgId = "org-service";
	const env = {
		...createMockEnv(),
		FIN_MCP_DELEGATION_SECRET: SECRET,
		FIN_DELEGATION_CLIENT_IDS: FIN_CLIENT,
		BETTER_AUTH_URL: ISSUER,
		__mcp: {
			organizationId: orgId,
			apiKeyId: FIN_CLIENT,
			userId: "fin-service-user",
			keyName: "Fin",
			keyPrefix: "oauth_",
			scopes: ["mcp:delegate", "mcp:read"],
			authMethod: "oauth" as const,
			oauthClientId: FIN_CLIENT,
		},
	};
	const server = new McpServer({ name: "test", version: "1.0.0" });
	registerTools(server, env as unknown as Parameters<typeof registerTools>[1]);
	return { server, env };
}

describe("MCP delegated tool access", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(checkRateLimit).mockResolvedValue(RATE_ALLOWED);
		memberFindFirst.mockResolvedValue({ id: "mem-1" });
	});

	it("requires actor_token for delegate-scoped callers", async () => {
		const { server } = makeDelegateServer();
		const handler = getToolHandler(server, "list_inventory");
		const result = (await handler({ limit: 10 })) as {
			content: Array<{ text: string }>;
		};
		expect(result.content[0]?.text).toContain("actor_token_required");
	});

	it("rejects actor_token from non-delegate credentials", async () => {
		const orgId = "org-1";
		const env = {
			...createMockEnv(),
			__mcp: {
				organizationId: orgId,
				apiKeyId: "key-1",
				userId: "user-1",
				keyName: "Key",
				keyPrefix: "rtn_live_",
				scopes: ["mcp:read"],
				authMethod: "api_key" as const,
			},
		};
		const server = new McpServer({ name: "test", version: "1.0.0" });
		registerTools(
			server,
			env as unknown as Parameters<typeof registerTools>[1],
		);
		const handler = getToolHandler(server, "list_inventory");
		const result = (await handler({
			limit: 10,
			actor_token: "fake-token",
		})) as { content: Array<{ text: string }> };
		expect(result.content[0]?.text).toContain("delegation_not_allowed");
	});

	it("rebinds context when actor_token is valid", async () => {
		const { server } = makeDelegateServer();
		const actorToken = await signDelegationToken({
			userId: "end-user-1",
			organizationId: "end-org-1",
			secret: SECRET,
			issuer: ISSUER,
		});
		const handler = getToolHandler(server, "list_inventory");
		await handler({ limit: 10, actor_token: actorToken });
		expect(getCargoPage).toHaveBeenCalledWith(
			expect.anything(),
			"end-org-1",
			expect.anything(),
		);
	});
});
