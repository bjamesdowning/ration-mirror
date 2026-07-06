import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
	getCargoByIds,
	getCargoItem,
	getCargoPage,
	getExpiringCargo,
} from "../../cargo.server";
import {
	getMealPlan,
	getTodayISO,
	getWeekEntries,
} from "../../manifest.server";
import { addDays } from "../../manifest-dates";
import { matchMeals } from "../../matching.server";
import { getMealsPage } from "../../meals.server";
import { getSupplyList, getSupplyListById } from "../../supply.server";
import { getTagsForCargoIds, tagsToSlugs } from "../../tags.server";
import { findSimilarCargoBatch } from "../../vector.server";
import { MCP_SERVER_VERSION } from "../../version";
import { decodeCursor, encodeCursor, err, ok } from "../envelope";
import { type McpToolsEnv, makeTool, registerMcpTool } from "../tool-runtime";

const MAX_PAGE_LIMIT = 200;
const MAX_MATCH_MEALS_LIMIT = 50;
const MAX_EXPIRING_DAYS = 90;
const MAX_EXPIRING_ITEMS = 200;

export function registerReadTools(server: McpServer, env: McpToolsEnv): void {
	registerMcpTool(
		server,
		"get_context",
		"Return the calling agent's organization id, API key id (prefix), authorized scopes, tool capabilities, kitchen tier/usage/credits, and suggested next actions. Always safe to call first.",
		{},
		async () =>
			makeTool({
				name: "get_context",
				scopes: ["mcp:read"],
				rateLimitCategory: "mcp_list",
				audit: false,
				handler: async (ctx) => {
					const origin = (env.BETTER_AUTH_URL ?? "").replace(/\/$/, "");
					const {
						getAgentOnboardingState,
						buildGetContextCapabilities,
						buildSuggestedNextActions,
					} = await import("../../agent/onboarding.server");
					const { getAgentKitchenSnapshot } = await import(
						"../../agent/kitchen-snapshot.server"
					);
					const onboarding = await getAgentOnboardingState(
						env,
						ctx.organizationId,
						origin,
					);
					const kitchen = await getAgentKitchenSnapshot(
						env,
						ctx.organizationId,
					);
					const capabilities = buildGetContextCapabilities(ctx.scopes);
					const suggestedNextActions = buildSuggestedNextActions(
						onboarding,
						capabilities,
						kitchen,
					);
					return ok("get_context", {
						organizationId: ctx.organizationId,
						apiKeyId: ctx.apiKeyId,
						keyName: ctx.keyName,
						keyPrefix: ctx.keyPrefix,
						scopes: ctx.scopes,
						authMethod: ctx.authMethod,
						onboarding,
						kitchen,
						capabilities,
						suggestedNextActions,
						versions: { mcp: MCP_SERVER_VERSION },
					});
				},
			})(env, {}),
	);

	registerMcpTool(
		server,
		"search_ingredients",
		"Semantic search for ingredients in the pantry using vector similarity. Useful for finding available ingredients without knowing the exact name.",
		{
			query: z.string().describe("The ingredient to search for"),
			topK: z
				.number()
				.int()
				.min(1)
				.max(20)
				.optional()
				.describe("Maximum number of results to return (default 5, max 20)"),
		},
		async (args: { query: string; topK?: number }) =>
			makeTool({
				name: "search_ingredients",
				scopes: ["mcp:read"],
				rateLimitCategory: "mcp_search",
				audit: false,
				handler: async (ctx, a: typeof args) => {
					const results = await findSimilarCargoBatch(
						env,
						ctx.organizationId,
						[a.query],
						{ topK: a.topK ?? 5, threshold: 0.6 },
					);
					const matches = results.get(a.query) || [];
					if (matches.length === 0) {
						return ok("search_ingredients", { matches: [] });
					}
					const matchedIds = matches.map((m) => m.itemId);
					const cargoRows = await getCargoByIds(
						env.DB,
						ctx.organizationId,
						matchedIds,
					);
					const scoreByItemId = new Map(
						matches.map((m) => [m.itemId, m.score]),
					);
					const items = cargoRows.map((c) => ({
						...c,
						matchScore: scoreByItemId.get(c.id) ?? 0,
					}));
					return ok("search_ingredients", { matches: items });
				},
			})(env, args),
	);

	registerMcpTool(
		server,
		"list_inventory",
		"Retrieve ingredients in the pantry. Cursor-paginated: pass `cursor` from a previous response to fetch the next page. Default limit 100, max 200.",
		{
			domain: z
				.enum(["food", "household", "alcohol"])
				.optional()
				.describe("Filter by domain"),
			limit: z
				.number()
				.int()
				.min(1)
				.max(MAX_PAGE_LIMIT)
				.optional()
				.describe(`Page size (default 100, max ${MAX_PAGE_LIMIT})`),
			cursor: z
				.string()
				.optional()
				.describe("Cursor from a previous response's meta.nextCursor"),
		},
		async (args: {
			domain?: "food" | "household" | "alcohol";
			limit?: number;
			cursor?: string;
		}) =>
			makeTool({
				name: "list_inventory",
				scopes: ["mcp:read"],
				rateLimitCategory: "mcp_list",
				audit: false,
				handler: async (ctx, a: typeof args) => {
					const limit = a.limit ?? 100;
					const decoded = a.cursor ? decodeCursor(a.cursor) : null;
					if (a.cursor && !decoded) {
						return err(
							"list_inventory",
							"invalid_input",
							"Malformed cursor; omit it to start from the first page.",
						);
					}
					const cursor = decoded
						? { createdAt: new Date(decoded.createdAt), id: decoded.id }
						: null;
					const { items, nextCursor } = await getCargoPage(
						env.DB,
						ctx.organizationId,
						{ limit, cursor, domain: a.domain },
					);
					const tagMap = await getTagsForCargoIds(
						env.DB,
						items.map((c) => c.id),
					);
					const mapped = items.map((c) => ({
						id: c.id,
						name: c.name,
						quantity: c.quantity,
						unit: c.unit,
						domain: c.domain,
						tags: tagsToSlugs(tagMap.get(c.id) ?? []),
						expiresAt: c.expiresAt,
					}));
					return ok("list_inventory", mapped, {
						meta: {
							nextCursor: nextCursor
								? encodeCursor({
										createdAt: nextCursor.createdAt.toISOString(),
										id: nextCursor.id,
									})
								: null,
						},
					});
				},
			})(env, args),
	);

	registerMcpTool(
		server,
		"get_cargo_item",
		"Fetch one pantry item by id with all fields (tags, expiresAt, customFields). Useful before update_cargo_item.",
		{
			itemId: z.string().uuid().describe("Cargo item id"),
		},
		async (args: { itemId: string }) =>
			makeTool({
				name: "get_cargo_item",
				scopes: ["mcp:read"],
				rateLimitCategory: "mcp_list",
				audit: false,
				handler: async (ctx, a: typeof args) => {
					const item = await getCargoItem(env.DB, ctx.organizationId, a.itemId);
					if (!item) {
						return err(
							"get_cargo_item",
							"not_found",
							`Cargo item ${a.itemId} not found.`,
						);
					}
					return ok("get_cargo_item", item);
				},
			})(env, args),
	);

	registerMcpTool(
		server,
		"get_supply_list",
		"Retrieve the user's active supply list. Each item includes its `id` so it can be referenced by update_supply_item, mark_supply_purchased, and remove_supply_item.",
		{},
		async () =>
			makeTool({
				name: "get_supply_list",
				scopes: ["mcp:read"],
				rateLimitCategory: "mcp_list",
				audit: false,
				handler: async (ctx) => {
					const list = await getSupplyList(env.DB, ctx.organizationId);
					if (!list) {
						return ok("get_supply_list", null);
					}
					const fullList = await getSupplyListById(
						env.DB,
						ctx.organizationId,
						list.id,
					);
					if (!fullList) {
						return ok("get_supply_list", null);
					}
					return ok("get_supply_list", {
						id: fullList.id,
						name: fullList.name,
						items: fullList.items.map((i) => ({
							id: i.id,
							name: i.name,
							quantity: i.quantity,
							unit: i.unit,
							domain: i.domain,
							isPurchased: i.isPurchased,
							sourceMeals: i.sourceMealNames,
						})),
					});
				},
			})(env, {}),
	);

	registerMcpTool(
		server,
		"get_meal_plan",
		"Retrieve the user's weekly meal plan. Returns scheduled meals by date and slot (breakfast, lunch, dinner, snack).",
		{
			startDate: z
				.string()
				.regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD format")
				.optional(),
			days: z.number().int().min(1).max(14).optional().default(7),
		},
		async (args: { startDate?: string; days?: number }) =>
			makeTool({
				name: "get_meal_plan",
				scopes: ["mcp:read"],
				rateLimitCategory: "mcp_list",
				audit: false,
				handler: async (ctx, a: typeof args) => {
					const plan = await getMealPlan(env.DB, ctx.organizationId);
					if (!plan) {
						return ok("get_meal_plan", null);
					}
					const startDate = a.startDate ?? getTodayISO();
					const days = a.days ?? 7;
					const endDate = addDays(startDate, days - 1);
					const entries = await getWeekEntries(
						env.DB,
						plan.id,
						startDate,
						endDate,
					);
					return ok("get_meal_plan", {
						planId: plan.id,
						planName: plan.name,
						startDate,
						endDate,
						entries: entries.map((e) => ({
							id: e.id,
							date: e.date,
							slotType: e.slotType,
							mealId: e.mealId,
							mealName: e.mealName,
							servings: e.servingsOverride ?? e.mealServings,
							notes: e.notes,
							consumedAt: e.consumedAt,
						})),
					});
				},
			})(env, args),
	);

	registerMcpTool(
		server,
		"list_meals",
		"List meals/recipes (cursor-paginated, default limit 100, max 200). Pass includeIngredients:false to skip ingredient fan-out — useful when scanning the index.",
		{
			tag: z.string().optional(),
			domain: z.enum(["food", "household", "alcohol"]).optional(),
			limit: z.number().int().min(1).max(MAX_PAGE_LIMIT).optional(),
			cursor: z.string().optional(),
			includeIngredients: z.boolean().optional(),
		},
		async (args: {
			tag?: string;
			domain?: "food" | "household" | "alcohol";
			limit?: number;
			cursor?: string;
			includeIngredients?: boolean;
		}) =>
			makeTool({
				name: "list_meals",
				scopes: ["mcp:read"],
				rateLimitCategory: "mcp_list",
				audit: false,
				handler: async (ctx, a: typeof args) => {
					const limit = a.limit ?? 100;
					const decoded = a.cursor ? decodeCursor(a.cursor) : null;
					if (a.cursor && !decoded) {
						return err(
							"list_meals",
							"invalid_input",
							"Malformed cursor; omit it to start from the first page.",
						);
					}
					const cursor = decoded
						? { createdAt: new Date(decoded.createdAt), id: decoded.id }
						: null;
					const { items, nextCursor } = await getMealsPage(
						env.DB,
						ctx.organizationId,
						{
							limit,
							cursor,
							tag: a.tag,
							domain: a.domain,
							includeIngredients: a.includeIngredients ?? true,
						},
					);
					const mapped = items.map((m) => ({
						id: m.id,
						name: m.name,
						domain: m.domain,
						description: m.description ?? undefined,
						directions: m.directions ?? undefined,
						equipment: m.equipment ?? [],
						servings: m.servings ?? 1,
						prepTime: m.prepTime ?? undefined,
						cookTime: m.cookTime ?? undefined,
						customFields: m.customFields ?? {},
						type: m.type,
						tags: m.tags,
						ingredients: m.ingredients.map((i) => ({
							ingredientName: i.ingredientName,
							quantity: i.quantity,
							unit: i.unit,
							cargoId: i.cargoId ?? undefined,
							isOptional: i.isOptional ?? false,
							orderIndex: i.orderIndex ?? 0,
						})),
					}));
					return ok("list_meals", mapped, {
						meta: {
							nextCursor: nextCursor
								? encodeCursor({
										createdAt: nextCursor.createdAt.toISOString(),
										id: nextCursor.id,
									})
								: null,
						},
					});
				},
			})(env, args),
	);

	registerMcpTool(
		server,
		"match_meals",
		"Find meals that can be made with the current pantry. Use 'strict' for fully cookable, 'delta' to see partial matches with what's missing.",
		{
			mode: z.enum(["strict", "delta"]).optional().default("strict"),
			minMatch: z.number().min(0).max(100).optional().default(50),
			limit: z
				.number()
				.int()
				.positive()
				.max(MAX_MATCH_MEALS_LIMIT)
				.optional()
				.default(10),
			tags: z.string().optional(),
		},
		async (args: {
			mode?: "strict" | "delta";
			minMatch?: number;
			limit?: number;
			tags?: string;
		}) =>
			makeTool({
				name: "match_meals",
				scopes: ["mcp:read"],
				rateLimitCategory: "mcp_search",
				audit: false,
				handler: async (ctx, a: typeof args) => {
					const limit = Math.min(a.limit ?? 10, MAX_MATCH_MEALS_LIMIT);
					const results = await matchMeals(env, ctx.organizationId, {
						mode: a.mode ?? "strict",
						minMatch: a.minMatch ?? 50,
						limit,
						preLimit: Math.min(limit * 5, 200),
						tags: a.tags,
					});
					const mapped = results.map((r) => ({
						mealId: r.meal.id,
						mealName: r.meal.name,
						matchPercentage: Math.round(r.matchPercentage),
						canMake: r.canMake,
						missingIngredients: r.missingIngredients.map((m) => ({
							name: m.name,
							needed: `${m.requiredQuantity} ${m.unit}`,
							optional: m.isOptional,
						})),
					}));
					return ok("match_meals", mapped);
				},
			})(env, args),
	);

	registerMcpTool(
		server,
		"get_expiring_items",
		"List pantry items that are expiring soon. Useful for reducing food waste and planning rescue meals.",
		{
			days: z
				.number()
				.int()
				.positive()
				.max(MAX_EXPIRING_DAYS)
				.optional()
				.default(7),
		},
		async (args: { days?: number }) =>
			makeTool({
				name: "get_expiring_items",
				scopes: ["mcp:read"],
				rateLimitCategory: "mcp_list",
				audit: false,
				handler: async (ctx, a: typeof args) => {
					const now = new Date();
					const lookaheadDays = Math.min(a.days ?? 7, MAX_EXPIRING_DAYS);
					const expiringItems = await getExpiringCargo(
						env.DB,
						ctx.organizationId,
						lookaheadDays,
						MAX_EXPIRING_ITEMS,
					);
					const mapped = expiringItems.map((item) => {
						const expiresAt = item.expiresAt ? new Date(item.expiresAt) : null;
						const daysUntilExpiry = expiresAt
							? Math.ceil(
									(expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
								)
							: null;
						return {
							id: item.id,
							name: item.name,
							quantity: item.quantity,
							unit: item.unit,
							expiresAt: item.expiresAt,
							daysUntilExpiry,
						};
					});
					return ok("get_expiring_items", mapped);
				},
			})(env, args),
	);
}
