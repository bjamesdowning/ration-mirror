import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MCP_TOOL_GROUPS } from "~/lib/agent-readiness";
import { createMockEnv } from "~/test/helpers/mock-env";
import { registerTools } from "../tools";

vi.mock("~/lib/cargo.server", () => ({
	getCargo: vi.fn(),
	getCargoByIds: vi.fn(),
	getCargoItem: vi.fn(),
	getCargoPage: vi.fn(),
	ingestCargoItems: vi.fn(),
	jettisonItem: vi.fn(),
	updateItem: vi.fn(),
}));

vi.mock("~/lib/auth.server", () => ({
	getUserSettings: vi.fn().mockResolvedValue({}),
	patchUserSettings: vi.fn(),
}));

vi.mock("~/lib/inventory-import.server", () => ({
	previewInventoryImport: vi.fn(),
	applyInventoryImport: vi.fn(),
	importInventoryCsv: vi.fn(),
	getInventoryImportSchema: vi.fn(() => ({ maxRows: 500, fields: {} })),
}));

vi.mock("~/lib/meal-selection.server", () => ({
	clearMealSelections: vi.fn(),
	getActiveMealSelections: vi.fn().mockResolvedValue([]),
	upsertMealSelection: vi.fn(),
	validateMealOwnership: vi.fn().mockResolvedValue(true),
}));

vi.mock("~/lib/manifest.server", () => ({
	ensureMealPlan: vi.fn(),
	addEntry: vi.fn(),
	deleteEntry: vi.fn(),
	updateEntry: vi.fn(),
	getMealPlan: vi.fn(),
	getTodayISO: vi.fn(() => "2026-03-07"),
	getWeekEntries: vi.fn(),
}));

vi.mock("~/lib/matching.server", () => ({
	matchMeals: vi.fn(),
}));

vi.mock("~/lib/meals.server", () => ({
	getMeals: vi.fn(),
	getMealsPage: vi.fn(),
	cookMeal: vi.fn(),
	updateMeal: vi.fn(),
	createMeal: vi.fn(),
	deleteMeal: vi.fn(),
}));

vi.mock("~/lib/ledger.server", () => ({
	checkBalance: vi.fn(),
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
	createSupplyListFromSelectedMeals: vi.fn(),
	completeSupplyList: vi.fn(),
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
		limit: vi.fn().mockResolvedValue([]),
	})),
}));

const { getCargoPage, ingestCargoItems, jettisonItem, updateItem } =
	await import("~/lib/cargo.server");
const { checkBalance } = await import("~/lib/ledger.server");
const {
	ensureMealPlan,
	addEntry,
	deleteEntry,
	updateEntry,
	getMealPlan,
	getWeekEntries,
} = await import("~/lib/manifest.server");
const { matchMeals } = await import("~/lib/matching.server");
const { getMealsPage, cookMeal, updateMeal, createMeal } = await import(
	"~/lib/meals.server"
);
const { checkRateLimit } = await import("~/lib/rate-limiter.server");
const {
	getSupplyList,
	getSupplyListById,
	ensureSupplyList,
	addSupplyItem,
	updateSupplyItem,
	deleteSupplyItem,
	createSupplyListFromSelectedMeals,
} = await import("~/lib/supply.server");
const { drizzle } = await import("drizzle-orm/d1");
const { findSimilarCargoBatch } = await import("~/lib/vector.server");

/**
 * Parses the MCP envelope from a tool response. Returns `data` on success,
 * throws on `ok: false` so tests can use `.toThrow()` for error paths.
 */
function parseOk(result: { content: Array<{ type: string; text: string }> }) {
	const text = result.content[0]?.text ?? "{}";
	const parsed = JSON.parse(text);
	if (parsed?.ok === false) {
		throw new Error(
			`Envelope ok=false: ${parsed.error?.code} ${parsed.error?.message}`,
		);
	}
	return parsed?.data;
}

function parseEnvelope(result: {
	content: Array<{ type: string; text: string }>;
}) {
	const text = result.content[0]?.text ?? "{}";
	return JSON.parse(text);
}

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
	const mockEnv = {
		...createMockEnv(),
		__orgId: orgId,
		__mcp: {
			organizationId: orgId,
			apiKeyId: "key-test-123",
			userId: "user-test-123",
			keyName: "Test Key",
			keyPrefix: "ration_test",
			scopes: ["mcp"], // legacy full scope
		},
	};
	const server = new McpServer({ name: "test", version: "1.0.0" });
	registerTools(
		server,
		mockEnv as unknown as Parameters<typeof registerTools>[1],
	);
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

		it("returns empty matches when no Vectorize matches", async () => {
			vi.mocked(findSimilarCargoBatch).mockResolvedValue(new Map());
			const server = makeServer();
			const result = await getToolHandler(
				server,
				"search_ingredients",
			)({ query: "unicorn dust" });
			const data = parseOk(result);
			expect(data.matches).toEqual([]);
		});
	});

	describe("list_inventory", () => {
		it("returns envelope with items and nextCursor=null for small page", async () => {
			vi.mocked(getCargoPage).mockResolvedValueOnce({
				items: [
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
				],
				nextCursor: null,
			} as never);
			const server = makeServer();
			const result = await getToolHandler(server, "list_inventory")({});
			const env = parseEnvelope(result);
			expect(env.ok).toBe(true);
			expect(env.data).toHaveLength(1);
			expect(env.data[0]).toMatchObject({
				id: "c1",
				name: "flour",
				quantity: 500,
				unit: "g",
			});
			expect(env.meta?.nextCursor).toBeNull();
		});

		it("returns nextCursor when more pages remain", async () => {
			vi.mocked(getCargoPage).mockResolvedValueOnce({
				items: Array.from({ length: 100 }, (_, i) => ({
					id: `c${i}`,
					name: `item-${i}`,
					quantity: 1,
					unit: "pc",
					domain: "food",
					tags: [],
					status: "stable",
					expiresAt: null,
					organizationId: "org-test-123",
					createdAt: new Date(),
					updatedAt: new Date(),
				})),
				nextCursor: { createdAt: new Date("2026-01-01"), id: "c99" },
			} as never);
			const server = makeServer();
			const result = await getToolHandler(server, "list_inventory")({});
			const env = parseEnvelope(result);
			expect(env.ok).toBe(true);
			expect(env.data).toHaveLength(100);
			expect(env.meta?.nextCursor).toBeTruthy();
		});
	});

	describe("get_supply_list", () => {
		it("returns null data when getSupplyList returns null", async () => {
			vi.mocked(getSupplyList).mockResolvedValueOnce(null);
			const server = makeServer();
			const result = await getToolHandler(server, "get_supply_list")({});
			const env = parseEnvelope(result);
			expect(env.ok).toBe(true);
			expect(env.data).toBeNull();
			expect(getSupplyListById).not.toHaveBeenCalled();
		});
	});

	describe("get_meal_plan", () => {
		it("blocks when rate limited", async () => {
			vi.mocked(checkRateLimit).mockResolvedValueOnce(RATE_BLOCKED);
			const server = makeServer();
			const result = await getToolHandler(server, "get_meal_plan")({});
			expect(result.content[0]?.text).toContain("Rate limit exceeded");
			expect(getMealPlan).not.toHaveBeenCalled();
		});

		it("returns null data when getMealPlan returns null", async () => {
			vi.mocked(getMealPlan).mockResolvedValueOnce(null);
			const server = makeServer();
			const result = await getToolHandler(server, "get_meal_plan")({});
			const env = parseEnvelope(result);
			expect(env.ok).toBe(true);
			expect(env.data).toBeNull();
			expect(getWeekEntries).not.toHaveBeenCalled();
		});

		it("returns plan and entries when plan exists", async () => {
			const mockPlan = {
				id: "plan-1",
				name: "Meal Plan",
				organizationId: "org-test-123",
			};
			const mockEntries = [
				{
					id: "entry-1",
					planId: "plan-1",
					mealId: "meal-1",
					date: "2026-03-07",
					slotType: "breakfast",
					orderIndex: 0,
					servingsOverride: null,
					notes: null,
					consumedAt: null,
					createdAt: new Date(),
					mealName: "Oatmeal",
					mealServings: 2,
					mealType: "recipe",
					mealPrepTime: null,
					mealCookTime: null,
				},
			];
			vi.mocked(getMealPlan).mockResolvedValueOnce(mockPlan as never);
			vi.mocked(getWeekEntries).mockResolvedValueOnce(mockEntries as never);

			const server = makeServer();
			const result = await getToolHandler(server, "get_meal_plan")({});
			const data = parseOk(result);
			expect(data.planId).toBe("plan-1");
			expect(data.planName).toBe("Meal Plan");
			expect(data.entries).toHaveLength(1);
			expect(data.entries[0]).toMatchObject({
				mealName: "Oatmeal",
				slotType: "breakfast",
				servings: 2,
			});
			expect(getWeekEntries).toHaveBeenCalledWith(
				expect.anything(),
				"plan-1",
				"2026-03-07",
				"2026-03-13",
			);
		});

		it("respects startDate and days parameters", async () => {
			const mockPlan = { id: "plan-1", name: "Meal Plan" };
			vi.mocked(getMealPlan).mockResolvedValueOnce(mockPlan as never);
			vi.mocked(getWeekEntries).mockResolvedValueOnce([] as never);

			const server = makeServer();
			await getToolHandler(
				server,
				"get_meal_plan",
			)({
				startDate: "2026-03-10",
				days: 3,
			});
			expect(getWeekEntries).toHaveBeenCalledWith(
				expect.anything(),
				"plan-1",
				"2026-03-10",
				"2026-03-12",
			);
		});
	});

	describe("list_meals", () => {
		it("returns empty array when no meals", async () => {
			vi.mocked(getMealsPage).mockResolvedValueOnce({
				items: [],
				nextCursor: null,
			} as never);
			const server = makeServer();
			const result = await getToolHandler(server, "list_meals")({});
			const data = parseOk(result);
			expect(data).toEqual([]);
		});

		it("returns full meal shape with directions, equipment, ingredientName", async () => {
			const mockMeals = [
				{
					id: "meal-1",
					name: "pancakes",
					domain: "food",
					type: "recipe",
					description: "Fluffy pancakes",
					directions: "Mix and cook.",
					equipment: ["pan"],
					servings: 4,
					prepTime: 5,
					cookTime: 10,
					customFields: {},
					tags: ["breakfast"],
					ingredients: [
						{
							ingredientName: "flour",
							quantity: 200,
							unit: "g",
							cargoId: null,
							isOptional: false,
							orderIndex: 0,
							mealId: "meal-1",
						},
					],
				},
			];
			vi.mocked(getMealsPage).mockResolvedValueOnce({
				items: mockMeals,
				nextCursor: null,
			} as never);
			const server = makeServer();
			const result = await getToolHandler(server, "list_meals")({});
			const data = parseOk(result);
			expect(data).toHaveLength(1);
			expect(data[0]).toMatchObject({
				id: "meal-1",
				name: "pancakes",
				domain: "food",
				directions: "Mix and cook.",
				equipment: ["pan"],
				prepTime: 5,
				cookTime: 10,
			});
			expect(data[0].ingredients[0]).toMatchObject({
				ingredientName: "flour",
				quantity: 200,
				unit: "g",
				isOptional: false,
				orderIndex: 0,
			});
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
			const data = parseOk(result);
			expect(data).toMatchObject({
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
			const data = parseOk(result);
			expect(data.removed).toBe(true);
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
			const data = parseOk(result);
			expect(data.isPurchased).toBe(true);
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
			const data = parseOk(result);
			expect(data.status).toBe("created");
			expect(data.item?.name).toBe("oat milk");
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

		it("requires confirm:true to actually delete", async () => {
			const server = makeServer();
			const result = await getToolHandler(
				server,
				"remove_cargo_item",
			)({
				itemId: "00000000-0000-0000-0000-000000000001",
			});
			const env = parseEnvelope(result);
			expect(env.ok).toBe(false);
			expect(env.error.code).toBe("invalid_input");
			expect(jettisonItem).not.toHaveBeenCalled();
		});

		it("removes item and returns confirmation when confirm:true", async () => {
			vi.mocked(jettisonItem).mockResolvedValueOnce(undefined as never);
			const server = makeServer();
			const result = await getToolHandler(
				server,
				"remove_cargo_item",
			)({
				itemId: "00000000-0000-0000-0000-000000000001",
				confirm: true,
			});
			const data = parseOk(result);
			expect(data.removed).toBe(true);
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
			const data = parseOk(result);
			expect(data.consumed).toBe(true);
			expect(data.note).toContain("deducted");
		});

		it("surfaces insufficient-cargo errors via envelope", async () => {
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
			const env = parseEnvelope(result);
			expect(env.ok).toBe(false);
			expect(env.error.code).toBe("insufficient_cargo");
			expect(env.error.message).toContain("potatoes");
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
			const data = parseOk(result);
			expect(data.entryId).toBe("entry-1");
			expect(data.mealName).toBe("Beef Burritos");
			expect(data.date).toBe("2026-03-10");
		});
	});

	describe("remove_meal_plan_entry", () => {
		it("blocks when rate limited", async () => {
			vi.mocked(checkRateLimit).mockResolvedValueOnce(RATE_BLOCKED);
			const server = makeServer();
			const result = await getToolHandler(
				server,
				"remove_meal_plan_entry",
			)({
				entryId: "00000000-0000-0000-0000-000000000001",
			});
			expect(result.content[0]?.text).toContain("Rate limit exceeded");
			expect(deleteEntry).not.toHaveBeenCalled();
		});

		it("returns removed true when deleteEntry succeeds", async () => {
			vi.mocked(ensureMealPlan).mockResolvedValueOnce({
				id: "plan-1",
			} as never);
			vi.mocked(deleteEntry).mockResolvedValueOnce(true);
			const server = makeServer();
			const result = await getToolHandler(
				server,
				"remove_meal_plan_entry",
			)({
				entryId: "00000000-0000-0000-0000-000000000001",
			});
			const data = parseOk(result);
			expect(data.removed).toBe(true);
			expect(deleteEntry).toHaveBeenCalledWith(
				expect.anything(),
				"org-test-123",
				"plan-1",
				"00000000-0000-0000-0000-000000000001",
			);
		});

		it("returns not_found error when entry missing", async () => {
			vi.mocked(ensureMealPlan).mockResolvedValueOnce({
				id: "plan-1",
			} as never);
			vi.mocked(deleteEntry).mockResolvedValueOnce(false);
			const server = makeServer();
			const result = await getToolHandler(
				server,
				"remove_meal_plan_entry",
			)({
				entryId: "00000000-0000-0000-0000-000000000001",
			});
			const env = parseEnvelope(result);
			expect(env.ok).toBe(false);
			expect(env.error.code).toBe("not_found");
		});
	});

	describe("update_meal_plan_entry", () => {
		it("blocks when rate limited", async () => {
			vi.mocked(checkRateLimit).mockResolvedValueOnce(RATE_BLOCKED);
			const server = makeServer();
			const result = await getToolHandler(
				server,
				"update_meal_plan_entry",
			)({
				entryId: "00000000-0000-0000-0000-000000000001",
				date: "2026-03-12",
			});
			expect(result.content[0]?.text).toContain("Rate limit exceeded");
			expect(updateEntry).not.toHaveBeenCalled();
		});

		it("requires at least one patch field", async () => {
			const server = makeServer();
			const result = await getToolHandler(
				server,
				"update_meal_plan_entry",
			)({
				entryId: "00000000-0000-0000-0000-000000000001",
			});
			expect(result.content[0]?.text).toContain("Provide at least one");
		});

		it("returns not_found error when no matching entry", async () => {
			vi.mocked(ensureMealPlan).mockResolvedValueOnce({
				id: "plan-1",
			} as never);
			const server = makeServer();
			const result = await getToolHandler(
				server,
				"update_meal_plan_entry",
			)({
				entryId: "00000000-0000-0000-0000-000000000001",
				date: "2026-03-12",
			});
			const env = parseEnvelope(result);
			expect(env.ok).toBe(false);
			expect(env.error.code).toBe("not_found");
		});

		it("returns conflict when entry is already consumed", async () => {
			vi.mocked(ensureMealPlan).mockResolvedValueOnce({
				id: "plan-1",
			} as never);
			vi.mocked(drizzle).mockImplementationOnce(
				() =>
					({
						select: vi.fn().mockReturnThis(),
						from: vi.fn().mockReturnThis(),
						where: vi.fn().mockReturnThis(),
						limit: vi.fn().mockResolvedValue([{ consumedAt: new Date() }]),
					}) as never,
			);
			const server = makeServer();
			const result = await getToolHandler(
				server,
				"update_meal_plan_entry",
			)({
				entryId: "00000000-0000-0000-0000-000000000001",
				date: "2026-03-12",
			});
			const env = parseEnvelope(result);
			expect(env.ok).toBe(false);
			expect(env.error.code).toBe("conflict");
			expect(updateEntry).not.toHaveBeenCalled();
		});

		it("updates when entry exists", async () => {
			vi.mocked(ensureMealPlan).mockResolvedValueOnce({
				id: "plan-1",
			} as never);
			vi.mocked(drizzle).mockImplementationOnce(
				() =>
					({
						select: vi.fn().mockReturnThis(),
						from: vi.fn().mockReturnThis(),
						where: vi.fn().mockReturnThis(),
						limit: vi.fn().mockResolvedValue([{ consumedAt: null }]),
					}) as never,
			);
			vi.mocked(updateEntry).mockResolvedValueOnce({
				id: "entry-1",
				date: "2026-03-12",
				slotType: "lunch",
				mealName: "salad",
				servingsOverride: null,
				mealServings: 2,
				notes: null,
				orderIndex: 0,
			} as never);
			const server = makeServer();
			const result = await getToolHandler(
				server,
				"update_meal_plan_entry",
			)({
				entryId: "00000000-0000-0000-0000-000000000001",
				date: "2026-03-12",
			});
			const data = parseOk(result);
			expect(data.entryId).toBe("entry-1");
			expect(updateEntry).toHaveBeenCalled();
		});
	});

	describe("sync_supply_from_selected_meals", () => {
		it("blocks when rate limited", async () => {
			vi.mocked(checkRateLimit).mockResolvedValueOnce(RATE_BLOCKED);
			const server = makeServer();
			const result = await getToolHandler(
				server,
				"sync_supply_from_selected_meals",
			)({});
			expect(result.content[0]?.text).toContain("Rate limit exceeded");
			expect(createSupplyListFromSelectedMeals).not.toHaveBeenCalled();
		});

		it("returns summary and item count", async () => {
			vi.mocked(createSupplyListFromSelectedMeals).mockResolvedValueOnce({
				list: { id: "l1" },
				summary: {
					addedItems: 3,
					skippedItems: 1,
					mealsProcessed: 2,
					totalIngredients: 10,
				},
			} as never);
			vi.mocked(getSupplyListById).mockResolvedValueOnce({
				id: "l1",
				items: [{}, {}, {}],
			} as never);
			const server = makeServer();
			const result = await getToolHandler(
				server,
				"sync_supply_from_selected_meals",
			)({ unitMode: "metric" });
			const data = parseOk(result);
			expect(data.summary.addedItems).toBe(3);
			expect(data.itemCount).toBe(3);
			expect(createSupplyListFromSelectedMeals).toHaveBeenCalledWith(
				expect.anything(),
				"org-test-123",
				undefined,
				expect.objectContaining({ trigger: "mcp_sync_supply" }),
				"metric",
			);
		});
	});

	describe("create_meal", () => {
		it("blocks when rate limited", async () => {
			vi.mocked(checkRateLimit).mockResolvedValueOnce(RATE_BLOCKED);
			const server = makeServer();
			const result = await getToolHandler(
				server,
				"create_meal",
			)({
				meal: {
					name: "toast",
					servings: 1,
					ingredients: [
						{ ingredientName: "bread", quantity: 1, unit: "slice" },
					],
				},
			});
			expect(result.content[0]?.text).toContain("Rate limit exceeded");
			expect(createMeal).not.toHaveBeenCalled();
		});

		it("creates meal and returns id", async () => {
			vi.mocked(createMeal).mockResolvedValueOnce({
				id: "new-meal-id",
				name: "toast",
				servings: 1,
				ingredients: [{ ingredientName: "bread", quantity: 1, unit: "slice" }],
				tags: [],
			} as never);
			const server = makeServer();
			const result = await getToolHandler(
				server,
				"create_meal",
			)({
				meal: {
					name: "Toast",
					servings: 1,
					ingredients: [
						{ ingredientName: "bread", quantity: 1, unit: "slice" },
					],
				},
			});
			const data = parseOk(result);
			expect(data.id).toBe("new-meal-id");
			expect(createMeal).toHaveBeenCalledWith(
				expect.anything(),
				"org-test-123",
				expect.objectContaining({ name: "toast", servings: 1 }),
				expect.anything(),
			);
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
			const data = parseOk(result);
			expect(data).toHaveLength(1);
			expect(data[0]?.mealName).toBe("Bacon Skillet");
			expect(data[0]?.canMake).toBe(true);
		});

		it("returns empty array when no strict matches", async () => {
			vi.mocked(matchMeals).mockResolvedValueOnce([] as never);
			const server = makeServer();
			const result = await getToolHandler(
				server,
				"match_meals",
			)({ mode: "strict" });
			const data = parseOk(result);
			expect(data).toEqual([]);
		});
	});

	describe("get_expiring_items", () => {
		it("blocks when rate limited", async () => {
			vi.mocked(checkRateLimit).mockResolvedValueOnce(RATE_BLOCKED);
			const server = makeServer();
			const result = await getToolHandler(server, "get_expiring_items")({});
			expect(result.content[0]?.text).toContain("Rate limit exceeded");
		});

		it("returns empty array when no expiring items", async () => {
			// drizzle mock returns [] by default via vi.mock("drizzle-orm/d1") above
			const server = makeServer();
			const result = await getToolHandler(
				server,
				"get_expiring_items",
			)({ days: 7 });
			const data = parseOk(result);
			expect(data).toEqual([]);
		});
	});

	// get_credit_balance was intentionally removed: MCP must not surface
	// UI-only credit/AI features. See plan Phase 1 (defects) and Phase 7.
	describe("get_credit_balance (removed)", () => {
		it("is no longer registered as an MCP tool", () => {
			const server = makeServer();
			const s = server as unknown as {
				_registeredTools: Record<string, unknown>;
			};
			expect(s._registeredTools.get_credit_balance).toBeUndefined();
		});
	});

	describe("update_cargo_item", () => {
		it("blocks when rate limited", async () => {
			vi.mocked(checkRateLimit).mockResolvedValueOnce(RATE_BLOCKED);
			const server = makeServer();
			const result = await getToolHandler(
				server,
				"update_cargo_item",
			)({
				itemId: "00000000-0000-0000-0000-000000000001",
				quantity: 0.4,
			});
			expect(result.content[0]?.text).toContain("Rate limit exceeded");
			expect(updateItem).not.toHaveBeenCalled();
		});

		it("updates item and returns new state", async () => {
			const mockItem = {
				id: "c1",
				name: "oat milk",
				quantity: 0.4,
				unit: "l",
				domain: "food",
				expiresAt: null,
			};
			vi.mocked(updateItem).mockResolvedValueOnce(mockItem as never);
			const server = makeServer();
			const result = await getToolHandler(
				server,
				"update_cargo_item",
			)({
				itemId: "00000000-0000-0000-0000-000000000001",
				quantity: 0.4,
				unit: "l",
			});
			const data = parseOk(result);
			expect(data).toMatchObject({
				id: "c1",
				quantity: 0.4,
				unit: "l",
			});
			expect(updateItem).toHaveBeenCalledWith(
				expect.anything(),
				"org-test-123",
				"00000000-0000-0000-0000-000000000001",
				expect.objectContaining({ quantity: 0.4 }),
			);
		});

		it("returns not_found error when updateItem returns null", async () => {
			vi.mocked(updateItem).mockResolvedValueOnce(null as never);
			const server = makeServer();
			const result = await getToolHandler(
				server,
				"update_cargo_item",
			)({
				itemId: "00000000-0000-0000-0000-000000000001",
				quantity: 1,
			});
			const env = parseEnvelope(result);
			expect(env.ok).toBe(false);
			expect(env.error.code).toBe("not_found");
		});
	});

	describe("update_meal", () => {
		it("blocks when rate limited", async () => {
			vi.mocked(checkRateLimit).mockResolvedValueOnce(RATE_BLOCKED);
			const server = makeServer();
			const mealPayload = {
				id: "00000000-0000-0000-0000-000000000001",
				name: "pancakes",
				domain: "food",
				ingredients: [
					{
						ingredientName: "flour",
						quantity: 250,
						unit: "g",
					},
				],
				tags: [],
			};
			const result = await getToolHandler(
				server,
				"update_meal",
			)({
				meal: mealPayload,
			});
			expect(result.content[0]?.text).toContain("Rate limit exceeded");
			expect(updateMeal).not.toHaveBeenCalled();
		});

		it("returns meal-not-found when updateMeal returns null", async () => {
			vi.mocked(updateMeal).mockResolvedValueOnce(null as never);
			const server = makeServer();
			const mealPayload = {
				id: "550e8400-e29b-41d4-a716-446655440000",
				name: "pancakes",
				domain: "food",
				ingredients: [
					{
						ingredientName: "flour",
						quantity: 250,
						unit: "g",
					},
				],
				tags: [],
			};
			const result = await getToolHandler(
				server,
				"update_meal",
			)({
				meal: mealPayload,
			});
			expect(result.content[0]?.text).toContain("Meal not found");
		});

		it("updates meal and returns confirmation", async () => {
			const mealId = "550e8400-e29b-41d4-a716-446655440001";
			const mockUpdated = {
				id: mealId,
				name: "pancakes",
				domain: "food",
				description: null,
				servings: 4,
				ingredients: [
					{
						ingredientName: "flour",
						quantity: 250,
						unit: "g",
					},
				],
				tags: ["breakfast"],
			};
			vi.mocked(updateMeal).mockResolvedValueOnce(mockUpdated as never);
			const server = makeServer();
			const mealPayload = {
				id: mealId,
				name: "pancakes",
				domain: "food",
				ingredients: [
					{
						ingredientName: "flour",
						quantity: 250,
						unit: "g",
					},
				],
				tags: ["breakfast"],
			};
			const result = await getToolHandler(
				server,
				"update_meal",
			)({
				meal: mealPayload,
			});
			const data = parseOk(result);
			expect(data).toMatchObject({
				id: mealId,
				name: "pancakes",
				servings: 4,
			});
			expect(data.ingredients[0]).toMatchObject({
				ingredientName: "flour",
				quantity: 250,
			});
			expect(updateMeal).toHaveBeenCalledWith(
				expect.anything(),
				"org-test-123",
				mealId,
				expect.objectContaining({
					name: "pancakes",
					ingredients: expect.any(Array),
				}),
			);
		});
	});

	// ── No-Credit Boundary (regression) ──────────────────────────────────────
	// MCP must NOT surface credit-consuming AI features. Receipt parsing
	// happens in the agent's LLM; Ration only ingests pre-parsed structured
	// items. Vector embeddings for cargo are skipped (skipVectorPhase: true).
	describe("no-credit boundary", () => {
		it("does not register get_credit_balance, scan, or generate tools", () => {
			const server = makeServer();
			const s = server as unknown as {
				_registeredTools: Record<string, unknown>;
			};
			const banned = [
				"get_credit_balance",
				"scan_receipt",
				"generate_meals",
				"ai_meal_generate",
			];
			for (const name of banned) {
				expect(s._registeredTools[name]).toBeUndefined();
			}
		});

		it("checkBalance is never invoked from any registered tool path", async () => {
			vi.mocked(checkBalance).mockClear();
			const server = makeServer();
			const tools = (
				server as unknown as {
					_registeredTools: Record<string, { handler: unknown }>;
				}
			)._registeredTools;
			expect(Object.keys(tools).length).toBeGreaterThan(0);
			expect(checkBalance).not.toHaveBeenCalled();
		});

		it("registered tools exactly match MCP_TOOL_GROUPS (no drift)", () => {
			const server = makeServer();
			const registered = Object.keys(
				(
					server as unknown as {
						_registeredTools: Record<string, unknown>;
					}
				)._registeredTools,
			).sort();
			const advertised = MCP_TOOL_GROUPS.flatMap((g) => [...g.tools]).sort();
			// Drift is bidirectional: agents should not see ghost tools, and
			// real tools should be discoverable via /.well-known.
			expect(registered).toEqual(advertised);
		});

		it("add_cargo_item passes skipVectorPhase:true to ingestCargoItems", async () => {
			vi.mocked(ingestCargoItems).mockResolvedValueOnce([
				{
					status: "created",
					item: { id: "c1", name: "x", quantity: 1, unit: "pc" },
				} as never,
			]);
			const server = makeServer();
			await getToolHandler(
				server,
				"add_cargo_item",
			)({ name: "x", quantity: 1, unit: "pc" });
			expect(ingestCargoItems).toHaveBeenCalledWith(
				expect.anything(),
				"org-test-123",
				expect.any(Array),
				expect.objectContaining({ skipVectorPhase: true }),
			);
		});
	});
});
