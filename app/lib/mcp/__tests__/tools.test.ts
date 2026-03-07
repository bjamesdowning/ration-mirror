import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockEnv } from "~/test/helpers/mock-env";
import { registerTools } from "../tools";

vi.mock("~/lib/cargo.server", () => ({
	getCargo: vi.fn(),
	getCargoByIds: vi.fn(),
	ingestCargoItems: vi.fn(),
	jettisonItem: vi.fn(),
}));

vi.mock("~/lib/manifest.server", () => ({
	ensureMealPlan: vi.fn(),
	addEntry: vi.fn(),
}));

vi.mock("~/lib/matching.server", () => ({
	matchMeals: vi.fn(),
}));

vi.mock("~/lib/meals.server", () => ({
	getMeals: vi.fn(),
	cookMeal: vi.fn(),
}));

vi.mock("~/lib/rate-limiter.server", () => ({
	checkRateLimit: vi.fn(),
}));

vi.mock("~/lib/supply.server", () => ({
	getSupplyList: vi.fn(),
	getSupplyListById: vi.fn(),
	ensureSupplyList: vi.fn(),
	addSupplyItem: vi.fn(),
	updateSupplyItem: vi.fn(),
	deleteSupplyItem: vi.fn(),
}));

vi.mock("~/lib/vector.server", () => ({
	findSimilarCargoBatch: vi.fn(),
}));

// D1 direct query in get_expiring_items — mock drizzle-orm/d1 chain
vi.mock("drizzle-orm/d1", () => ({
	drizzle: vi.fn(() => ({
		select: vi.fn().mockReturnThis(),
		from: vi.fn().mockReturnThis(),
		where: vi.fn().mockReturnThis(),
		orderBy: vi.fn().mockResolvedValue([]),
	})),
}));

const { getCargo, ingestCargoItems, jettisonItem } = await import(
	"~/lib/cargo.server"
);
const { ensureMealPlan, addEntry } = await import("~/lib/manifest.server");
const { matchMeals } = await import("~/lib/matching.server");
const { getMeals, cookMeal } = await import("~/lib/meals.server");
const { checkRateLimit } = await import("~/lib/rate-limiter.server");
const {
	getSupplyList,
	getSupplyListById,
	ensureSupplyList,
	addSupplyItem,
	updateSupplyItem,
	deleteSupplyItem,
} = await import("~/lib/supply.server");
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

/** Returns a fresh server with all tools registered */
function makeServer(orgId = "org-test-123") {
	const mockEnv = { ...createMockEnv(), __orgId: orgId };
	const server = new McpServer({ name: "test", version: "1.0.0" });
	registerTools(server, mockEnv);
	return server;
}

const RATE_ALLOWED = {
	allowed: true,
	remaining: 10,
	resetAt: Date.now() + 60000,
};
const RATE_BLOCKED = {
	allowed: false,
	remaining: 0,
	resetAt: Date.now() + 30,
	retryAfter: 30,
};

describe("MCP tools", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(checkRateLimit).mockResolvedValue(RATE_ALLOWED);
	});

	// ── Existing Read Tools ──────────────────────────────────────────────────

	describe("search_ingredients", () => {
		it("returns rate limit message when rate limited", async () => {
			vi.mocked(checkRateLimit).mockResolvedValueOnce(RATE_BLOCKED);
			const server = makeServer();
			const result = await getToolHandler(
				server,
				"search_ingredients",
			)({ query: "chicken" });
			expect(result.content[0]?.text).toContain("Rate limit exceeded");
			expect(findSimilarCargoBatch).not.toHaveBeenCalled();
		});

		it("returns no-ingredients message when no Vectorize matches", async () => {
			vi.mocked(findSimilarCargoBatch).mockResolvedValue(new Map());
			const server = makeServer();
			const result = await getToolHandler(
				server,
				"search_ingredients",
			)({ query: "unicorn dust" });
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
					organizationId: "org-test-123",
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			]);
			const server = makeServer();
			const result = await getToolHandler(server, "list_inventory")({});
			const parsed = JSON.parse(result.content[0]?.text ?? "[]");
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
				organizationId: "org-test-123",
				createdAt: new Date(),
				updatedAt: new Date(),
			}));
			vi.mocked(getCargo).mockResolvedValueOnce(manyItems);
			const server = makeServer();
			const result = await getToolHandler(server, "list_inventory")({});
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
			const server = makeServer();
			const result = await getToolHandler(server, "get_supply_list")({});
			expect(result.content[0]?.text).toBe("No active supply list found.");
			expect(getSupplyListById).not.toHaveBeenCalled();
		});
	});

	describe("list_meals", () => {
		it("returns empty array when no meals", async () => {
			vi.mocked(getMeals).mockResolvedValueOnce([]);
			const server = makeServer();
			const result = await getToolHandler(server, "list_meals")({});
			const text = result.content[0]?.text ?? "[]";
			const parsed = JSON.parse(text);
			expect(parsed).toEqual([]);
			expect(result.content[0]?.text).not.toContain("truncated");
		});
	});

	// ── New Write Tools ──────────────────────────────────────────────────────

	describe("add_supply_item", () => {
		it("blocks when rate limited", async () => {
			vi.mocked(checkRateLimit).mockResolvedValueOnce(RATE_BLOCKED);
			const server = makeServer();
			const result = await getToolHandler(
				server,
				"add_supply_item",
			)({ name: "milk" });
			expect(result.content[0]?.text).toContain("Rate limit exceeded");
			expect(addSupplyItem).not.toHaveBeenCalled();
		});

		it("adds item to supply list and returns details", async () => {
			const mockList = { id: "list-1" };
			const mockItem = {
				id: "item-1",
				name: "milk",
				quantity: 2,
				unit: "l",
				isPurchased: false,
			};
			vi.mocked(ensureSupplyList).mockResolvedValueOnce(mockList as never);
			vi.mocked(addSupplyItem).mockResolvedValueOnce(mockItem as never);

			const server = makeServer();
			const result = await getToolHandler(
				server,
				"add_supply_item",
			)({ name: "milk", quantity: 2, unit: "l" });
			const parsed = JSON.parse(result.content[0]?.text ?? "{}");
			expect(parsed.added).toMatchObject({
				id: "item-1",
				name: "milk",
				quantity: 2,
				unit: "l",
			});
			expect(addSupplyItem).toHaveBeenCalledWith(
				expect.anything(),
				"org-test-123",
				"list-1",
				expect.objectContaining({ name: "milk", quantity: 2, unit: "l" }),
			);
		});

		it("returns error when ensureSupplyList returns null", async () => {
			vi.mocked(ensureSupplyList).mockResolvedValueOnce(null as never);
			const server = makeServer();
			const result = await getToolHandler(
				server,
				"add_supply_item",
			)({ name: "milk" });
			expect(result.content[0]?.text).toContain(
				"Could not locate or create supply list",
			);
		});
	});

	describe("update_supply_item", () => {
		it("blocks when rate limited", async () => {
			vi.mocked(checkRateLimit).mockResolvedValueOnce(RATE_BLOCKED);
			const server = makeServer();
			const result = await getToolHandler(
				server,
				"update_supply_item",
			)({
				itemId: "00000000-0000-0000-0000-000000000001",
				quantity: 3,
			});
			expect(result.content[0]?.text).toContain("Rate limit exceeded");
			expect(updateSupplyItem).not.toHaveBeenCalled();
		});

		it("returns not-found message when item missing", async () => {
			const mockList = { id: "list-1" };
			vi.mocked(ensureSupplyList).mockResolvedValueOnce(mockList as never);
			vi.mocked(updateSupplyItem).mockResolvedValueOnce(null as never);
			const server = makeServer();
			const result = await getToolHandler(
				server,
				"update_supply_item",
			)({
				itemId: "00000000-0000-0000-0000-000000000001",
				quantity: 3,
			});
			expect(result.content[0]?.text).toContain("not found on supply list");
		});
	});

	describe("remove_supply_item", () => {
		it("blocks when rate limited", async () => {
			vi.mocked(checkRateLimit).mockResolvedValueOnce(RATE_BLOCKED);
			const server = makeServer();
			const result = await getToolHandler(
				server,
				"remove_supply_item",
			)({
				itemId: "00000000-0000-0000-0000-000000000001",
			});
			expect(result.content[0]?.text).toContain("Rate limit exceeded");
			expect(deleteSupplyItem).not.toHaveBeenCalled();
		});

		it("removes item and returns confirmation", async () => {
			const mockList = { id: "list-1" };
			vi.mocked(ensureSupplyList).mockResolvedValueOnce(mockList as never);
			vi.mocked(deleteSupplyItem).mockResolvedValueOnce(undefined as never);
			const server = makeServer();
			const result = await getToolHandler(
				server,
				"remove_supply_item",
			)({
				itemId: "00000000-0000-0000-0000-000000000001",
			});
			const parsed = JSON.parse(result.content[0]?.text ?? "{}");
			expect(parsed.removed).toBe(true);
		});
	});

	describe("mark_supply_purchased", () => {
		it("blocks when rate limited", async () => {
			vi.mocked(checkRateLimit).mockResolvedValueOnce(RATE_BLOCKED);
			const server = makeServer();
			const result = await getToolHandler(
				server,
				"mark_supply_purchased",
			)({
				itemId: "00000000-0000-0000-0000-000000000001",
				purchased: true,
			});
			expect(result.content[0]?.text).toContain("Rate limit exceeded");
			expect(updateSupplyItem).not.toHaveBeenCalled();
		});

		it("marks item as purchased", async () => {
			const mockList = { id: "list-1" };
			const mockItem = { id: "item-1", name: "eggs", isPurchased: true };
			vi.mocked(ensureSupplyList).mockResolvedValueOnce(mockList as never);
			vi.mocked(updateSupplyItem).mockResolvedValueOnce(mockItem as never);
			const server = makeServer();
			const result = await getToolHandler(
				server,
				"mark_supply_purchased",
			)({
				itemId: "00000000-0000-0000-0000-000000000001",
				purchased: true,
			});
			const parsed = JSON.parse(result.content[0]?.text ?? "{}");
			expect(parsed.isPurchased).toBe(true);
		});
	});

	describe("add_cargo_item", () => {
		it("blocks when rate limited", async () => {
			vi.mocked(checkRateLimit).mockResolvedValueOnce(RATE_BLOCKED);
			const server = makeServer();
			const result = await getToolHandler(
				server,
				"add_cargo_item",
			)({ name: "milk", quantity: 2, unit: "l" });
			expect(result.content[0]?.text).toContain("Rate limit exceeded");
			expect(ingestCargoItems).not.toHaveBeenCalled();
		});

		it("creates item with skipVectorPhase and returns status", async () => {
			vi.mocked(ingestCargoItems).mockResolvedValueOnce([
				{
					status: "created",
					item: { id: "c99", name: "oat milk", quantity: 1, unit: "l" },
					id: "c99",
					name: "oat milk",
				} as never,
			]);
			const server = makeServer();
			const result = await getToolHandler(
				server,
				"add_cargo_item",
			)({ name: "oat milk", quantity: 1, unit: "l" });
			const parsed = JSON.parse(result.content[0]?.text ?? "{}");
			expect(parsed.status).toBe("created");
			expect(parsed.item?.name).toBe("oat milk");
			expect(ingestCargoItems).toHaveBeenCalledWith(
				expect.anything(),
				"org-test-123",
				expect.any(Array),
				expect.objectContaining({ skipVectorPhase: true }),
			);
		});
	});

	describe("remove_cargo_item", () => {
		it("blocks when rate limited", async () => {
			vi.mocked(checkRateLimit).mockResolvedValueOnce(RATE_BLOCKED);
			const server = makeServer();
			const result = await getToolHandler(
				server,
				"remove_cargo_item",
			)({
				itemId: "00000000-0000-0000-0000-000000000001",
			});
			expect(result.content[0]?.text).toContain("Rate limit exceeded");
			expect(jettisonItem).not.toHaveBeenCalled();
		});

		it("removes item and returns confirmation", async () => {
			vi.mocked(jettisonItem).mockResolvedValueOnce(undefined as never);
			const server = makeServer();
			const result = await getToolHandler(
				server,
				"remove_cargo_item",
			)({
				itemId: "00000000-0000-0000-0000-000000000001",
			});
			const parsed = JSON.parse(result.content[0]?.text ?? "{}");
			expect(parsed.removed).toBe(true);
		});
	});

	describe("consume_meal", () => {
		it("blocks when rate limited", async () => {
			vi.mocked(checkRateLimit).mockResolvedValueOnce(RATE_BLOCKED);
			const server = makeServer();
			const result = await getToolHandler(
				server,
				"consume_meal",
			)({
				mealId: "00000000-0000-0000-0000-000000000001",
			});
			expect(result.content[0]?.text).toContain("Rate limit exceeded");
			expect(cookMeal).not.toHaveBeenCalled();
		});

		it("cooks meal and returns success", async () => {
			vi.mocked(cookMeal).mockResolvedValueOnce(undefined as never);
			const server = makeServer();
			const result = await getToolHandler(
				server,
				"consume_meal",
			)({
				mealId: "00000000-0000-0000-0000-000000000001",
			});
			const parsed = JSON.parse(result.content[0]?.text ?? "{}");
			expect(parsed.consumed).toBe(true);
			expect(parsed.note).toContain("deducted");
		});

		it("surfaces insufficient-cargo errors clearly", async () => {
			vi.mocked(cookMeal).mockRejectedValueOnce(
				new Error("Insufficient Cargo for: potatoes, bacon lardons"),
			);
			const server = makeServer();
			const result = await getToolHandler(
				server,
				"consume_meal",
			)({
				mealId: "00000000-0000-0000-0000-000000000001",
			});
			expect(result.content[0]?.text).toContain("Cannot cook meal");
			expect(result.content[0]?.text).toContain("potatoes");
		});
	});

	describe("add_meal_plan_entry", () => {
		it("blocks when rate limited", async () => {
			vi.mocked(checkRateLimit).mockResolvedValueOnce(RATE_BLOCKED);
			const server = makeServer();
			const result = await getToolHandler(
				server,
				"add_meal_plan_entry",
			)({
				mealId: "00000000-0000-0000-0000-000000000001",
				date: "2026-03-10",
				slotType: "dinner",
			});
			expect(result.content[0]?.text).toContain("Rate limit exceeded");
			expect(addEntry).not.toHaveBeenCalled();
		});

		it("adds entry and returns confirmation", async () => {
			const mockPlan = { id: "plan-1" };
			const mockEntry = {
				id: "entry-1",
				mealName: "Beef Burritos",
				date: "2026-03-10",
				slotType: "dinner",
				mealServings: 2,
				servingsOverride: null,
			};
			vi.mocked(ensureMealPlan).mockResolvedValueOnce(mockPlan as never);
			vi.mocked(addEntry).mockResolvedValueOnce(mockEntry as never);

			const server = makeServer();
			const result = await getToolHandler(
				server,
				"add_meal_plan_entry",
			)({
				mealId: "00000000-0000-0000-0000-000000000001",
				date: "2026-03-10",
				slotType: "dinner",
			});
			const parsed = JSON.parse(result.content[0]?.text ?? "{}");
			expect(parsed.added.entryId).toBe("entry-1");
			expect(parsed.added.mealName).toBe("Beef Burritos");
			expect(parsed.added.date).toBe("2026-03-10");
		});
	});

	// ── New Read Tools ───────────────────────────────────────────────────────

	describe("match_meals", () => {
		it("blocks when rate limited", async () => {
			vi.mocked(checkRateLimit).mockResolvedValueOnce(RATE_BLOCKED);
			const server = makeServer();
			const result = await getToolHandler(server, "match_meals")({});
			expect(result.content[0]?.text).toContain("Rate limit exceeded");
			expect(matchMeals).not.toHaveBeenCalled();
		});

		it("returns matched meals", async () => {
			vi.mocked(matchMeals).mockResolvedValueOnce([
				{
					meal: { id: "m1", name: "Bacon Skillet" } as never,
					matchPercentage: 100,
					canMake: true,
					missingIngredients: [],
				},
			] as never);
			const server = makeServer();
			const result = await getToolHandler(server, "match_meals")({});
			const parsed = JSON.parse(result.content[0]?.text ?? "[]");
			expect(parsed).toHaveLength(1);
			expect(parsed[0]?.mealName).toBe("Bacon Skillet");
			expect(parsed[0]?.canMake).toBe(true);
		});

		it("suggests delta mode when no strict matches", async () => {
			vi.mocked(matchMeals).mockResolvedValueOnce([] as never);
			const server = makeServer();
			const result = await getToolHandler(
				server,
				"match_meals",
			)({ mode: "strict" });
			expect(result.content[0]?.text).toContain("No meals match");
			expect(result.content[0]?.text).toContain("mode='delta'");
		});
	});

	describe("get_expiring_items", () => {
		it("blocks when rate limited", async () => {
			vi.mocked(checkRateLimit).mockResolvedValueOnce(RATE_BLOCKED);
			const server = makeServer();
			const result = await getToolHandler(server, "get_expiring_items")({});
			expect(result.content[0]?.text).toContain("Rate limit exceeded");
		});

		it("returns no-expiring message when list empty", async () => {
			// drizzle mock returns [] by default via vi.mock("drizzle-orm/d1") above
			const server = makeServer();
			const result = await getToolHandler(
				server,
				"get_expiring_items",
			)({ days: 7 });
			expect(result.content[0]?.text).toContain("No items expiring");
		});
	});
});
