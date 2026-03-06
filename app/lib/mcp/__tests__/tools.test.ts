import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockEnv } from "~/test/helpers/mock-env";
import { registerTools } from "../tools";

vi.mock("~/lib/cargo.server", () => ({
	getCargo: vi.fn(),
	getCargoByIds: vi.fn(),
}));

vi.mock("~/lib/meals.server", () => ({
	getMeals: vi.fn(),
}));

vi.mock("~/lib/rate-limiter.server", () => ({
	checkRateLimit: vi.fn(),
}));

vi.mock("~/lib/supply.server", () => ({
	getSupplyList: vi.fn(),
	getSupplyListById: vi.fn(),
}));

vi.mock("~/lib/vector.server", () => ({
	findSimilarCargoBatch: vi.fn(),
}));

const { getCargo } = await import("~/lib/cargo.server");
const { getMeals } = await import("~/lib/meals.server");
const { checkRateLimit } = await import("~/lib/rate-limiter.server");
const { getSupplyList, getSupplyListById } = await import(
	"~/lib/supply.server"
);
const { findSimilarCargoBatch } = await import("~/lib/vector.server");

function getToolHandler(
	server: McpServer,
	name: string,
): (
	args: unknown,
	extra?: unknown,
) => Promise<{ content: Array<{ type: string; text: string }> }> {
	// Access internal _registeredTools for unit testing
	const s = server as unknown as {
		_registeredTools: Record<
			string,
			{ handler: (a: unknown, e?: unknown) => Promise<unknown> }
		>;
	};
	const tools = s._registeredTools;
	const tool = tools[name];
	if (!tool) throw new Error(`Tool ${name} not found`);
	return tool.handler as (
		args: unknown,
		extra?: unknown,
	) => Promise<{
		content: Array<{ type: string; text: string }>;
	}>;
}

describe("MCP tools", () => {
	const orgId = "org-test-123";
	const mockEnv = { ...createMockEnv(), __orgId: orgId };

	beforeEach(() => {
		vi.mocked(checkRateLimit).mockResolvedValue({
			allowed: true,
			remaining: 10,
			resetAt: Date.now() + 60000,
		});
	});

	describe("search_ingredients", () => {
		it("returns rate limit message when rate limited", async () => {
			vi.mocked(checkRateLimit).mockResolvedValueOnce({
				allowed: false,
				remaining: 0,
				resetAt: Date.now() + 30,
				retryAfter: 30,
			});

			const server = new McpServer({ name: "test", version: "1.0.0" });
			registerTools(server, mockEnv);
			const handler = getToolHandler(server, "search_ingredients");

			const result = await handler({ query: "chicken" });

			expect(result.content[0]?.text).toContain("Rate limit exceeded");
			expect(result.content[0]?.text).toContain("30");
			expect(findSimilarCargoBatch).not.toHaveBeenCalled();
		});

		it("returns no-ingredients message when no Vectorize matches", async () => {
			vi.mocked(findSimilarCargoBatch).mockResolvedValue(new Map());

			const server = new McpServer({ name: "test", version: "1.0.0" });
			registerTools(server, mockEnv);
			const handler = getToolHandler(server, "search_ingredients");

			const result = await handler({ query: "unicorn dust" });

			expect(result.content[0]?.text).toBe(
				'No ingredients found matching "unicorn dust"',
			);
		});
	});

	describe("list_inventory", () => {
		it("returns JSON for normal inventory", async () => {
			vi.mocked(getCargo).mockResolvedValueOnce([
				{
					id: "c1",
					name: "flour",
					quantity: 500,
					unit: "g",
					domain: "food",
					tags: [],
					status: "stable",
					expiresAt: null,
					organizationId: orgId,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			]);

			const server = new McpServer({ name: "test", version: "1.0.0" });
			registerTools(server, mockEnv);
			const handler = getToolHandler(server, "list_inventory");

			const result = await handler({});

			const text = result.content[0]?.text ?? "[]";
			const parsed = JSON.parse(text);
			expect(parsed).toHaveLength(1);
			expect(parsed[0]).toMatchObject({
				id: "c1",
				name: "flour",
				quantity: 500,
				unit: "g",
			});
			expect(result.content[0]?.text).not.toContain("truncated");
		});

		it("truncates at 501 items and appends note", async () => {
			const manyItems = Array.from({ length: 501 }, (_, i) => ({
				id: `c${i}`,
				name: `item-${i}`,
				quantity: 1,
				unit: "pc",
				domain: "food" as const,
				tags: [] as string[],
				status: "stable" as const,
				expiresAt: null as Date | null,
				organizationId: orgId,
				createdAt: new Date(),
				updatedAt: new Date(),
			}));
			vi.mocked(getCargo).mockResolvedValueOnce(manyItems);

			const server = new McpServer({ name: "test", version: "1.0.0" });
			registerTools(server, mockEnv);
			const handler = getToolHandler(server, "list_inventory");

			const result = await handler({});

			const rawText = result.content[0]?.text ?? "[]";
			const parsed = JSON.parse(
				rawText.replace(/\n\n\[Results truncated:.*\]$/, ""),
			);
			expect(parsed).toHaveLength(500);
			expect(result.content[0]?.text).toContain(
				"[Results truncated: showing 500 of 501 items",
			);
		});
	});

	describe("get_supply_list", () => {
		it("returns no-active-supply-list when getSupplyList returns null", async () => {
			vi.mocked(getSupplyList).mockResolvedValueOnce(null);

			const server = new McpServer({ name: "test", version: "1.0.0" });
			registerTools(server, mockEnv);
			const handler = getToolHandler(server, "get_supply_list");

			const result = await handler({});

			expect(result.content[0]?.text).toBe("No active supply list found.");
			expect(getSupplyListById).not.toHaveBeenCalled();
		});
	});

	describe("list_meals", () => {
		it("returns empty array when no meals", async () => {
			vi.mocked(getMeals).mockResolvedValueOnce([]);

			const server = new McpServer({ name: "test", version: "1.0.0" });
			registerTools(server, mockEnv);
			const handler = getToolHandler(server, "list_meals");

			const result = await handler({});

			const text = result.content[0]?.text ?? "[]";
			const parsed = JSON.parse(text);
			expect(parsed).toEqual([]);
			expect(result.content[0]?.text).not.toContain("truncated");
		});
	});
});
