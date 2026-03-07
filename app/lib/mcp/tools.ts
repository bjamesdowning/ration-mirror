import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { and, eq, gte, isNotNull, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { z } from "zod";
import { cargo } from "../../db/schema";
import {
	getCargo,
	getCargoByIds,
	ingestCargoItems,
	jettisonItem,
	updateItem,
} from "../cargo.server";
import { checkBalance } from "../ledger.server";
import { addEntry, ensureMealPlan } from "../manifest.server";
import { matchMeals } from "../matching.server";
import { cookMeal, getMeals } from "../meals.server";
import { checkRateLimit } from "../rate-limiter.server";
import {
	addSupplyItem,
	deleteSupplyItem,
	ensureSupplyList,
	getSupplyList,
	getSupplyListById,
	updateSupplyItem,
} from "../supply.server";
import { toSupportedUnit } from "../units";
import { findSimilarCargoBatch } from "../vector.server";

export function registerTools(
	server: McpServer,
	env: Cloudflare.Env & { __orgId: string },
): void {
	/**
	 * Tool: search_ingredients
	 * Uses Vectorize semantic search to find items matching the query.
	 */
	server.tool(
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
		async (args: { query: string; topK?: number }) => {
			const { query, topK } = args;

			const rateLimit = await checkRateLimit(
				env.RATION_KV,
				"mcp_search",
				env.__orgId,
			);
			if (!rateLimit.allowed) {
				return {
					content: [
						{
							type: "text",
							text: `Rate limit exceeded. Retry after ${rateLimit.retryAfter ?? 60} seconds.`,
						},
					],
				};
			}

			const results = await findSimilarCargoBatch(
				env,
				env.__orgId,
				[query],
				{ topK: topK ?? 5, threshold: 0.6 }, // Lowering threshold slightly for agent search
			);

			const matches = results.get(query) || [];
			if (matches.length === 0) {
				return {
					content: [
						{ type: "text", text: `No ingredients found matching "${query}"` },
					],
				};
			}

			// Fetch only the matched IDs — never a full table scan
			const matchedIds = matches.map((m) => m.itemId);
			const cargoRows = await getCargoByIds(env.DB, env.__orgId, matchedIds);
			const scoreByItemId = new Map(matches.map((m) => [m.itemId, m.score]));
			const fullItems = cargoRows.map((c) => ({
				...c,
				matchScore: scoreByItemId.get(c.id) ?? 0,
			}));

			return {
				content: [{ type: "text", text: JSON.stringify(fullItems, null, 2) }],
			};
		},
	);

	/**
	 * Tool: list_inventory
	 * Lists all items currently in the user's pantry/cargo.
	 */
	server.tool(
		"list_inventory",
		"Retrieve all ingredients currently in the user's pantry.",
		{
			domain: z
				.enum(["food", "household", "alcohol"])
				.optional()
				.describe("Filter by domain (e.g., 'food', 'household')"),
		},
		async (args: { domain?: "food" | "household" | "alcohol" }) => {
			const { domain } = args;

			const rateLimit = await checkRateLimit(
				env.RATION_KV,
				"mcp_list",
				env.__orgId,
			);
			if (!rateLimit.allowed) {
				return {
					content: [
						{
							type: "text",
							text: `Rate limit exceeded. Retry after ${rateLimit.retryAfter ?? 60} seconds.`,
						},
					],
				};
			}

			// Intentional full-table scan: agents need the complete inventory to plan
			// meals/shopping. This endpoint is read-only and scoped to the org via RLS.
			const cargo = await getCargo(env.DB, env.__orgId, domain);

			const mapped = cargo.map((c) => ({
				id: c.id,
				name: c.name,
				quantity: c.quantity,
				unit: c.unit,
				domain: c.domain,
				tags: c.tags,
				expiresAt: c.expiresAt,
			}));

			const MAX_LIST_INVENTORY = 500;
			const truncated = mapped.length > MAX_LIST_INVENTORY;
			const items = truncated ? mapped.slice(0, MAX_LIST_INVENTORY) : mapped;
			const note = truncated
				? `\n\n[Results truncated: showing ${MAX_LIST_INVENTORY} of ${mapped.length} items. Use search_ingredients for targeted lookup.]`
				: "";

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(items, null, 2) + note,
					},
				],
			};
		},
	);

	/**
	 * Tool: get_supply_list
	 * Gets the items currently on the supply list (shopping list).
	 */
	server.tool(
		"get_supply_list",
		"Retrieve the user's active supply list (shopping list).",
		{},
		async () => {
			const rateLimit = await checkRateLimit(
				env.RATION_KV,
				"mcp_list",
				env.__orgId,
			);
			if (!rateLimit.allowed) {
				return {
					content: [
						{
							type: "text",
							text: `Rate limit exceeded. Retry after ${rateLimit.retryAfter ?? 60} seconds.`,
						},
					],
				};
			}

			const list = await getSupplyList(env.DB, env.__orgId);
			if (!list) {
				return {
					content: [{ type: "text", text: "No active supply list found." }],
				};
			}

			const fullList = await getSupplyListById(env.DB, env.__orgId, list.id);
			if (!fullList) {
				return {
					content: [{ type: "text", text: "Supply list not found." }],
				};
			}

			const mapped = {
				name: fullList.name,
				items: fullList.items.map((i) => ({
					name: i.name,
					quantity: i.quantity,
					unit: i.unit,
					domain: i.domain,
					isPurchased: i.isPurchased,
					sourceMeals: i.sourceMealNames,
				})),
			};

			return {
				content: [{ type: "text", text: JSON.stringify(mapped, null, 2) }],
			};
		},
	);

	/**
	 * Tool: list_meals
	 * Retrieves the user's recipes/meals and their required ingredients.
	 */
	server.tool(
		"list_meals",
		"List available meals/recipes, including their required ingredients and servings.",
		{
			tag: z.string().optional().describe("Filter meals by an exact tag"),
		},
		async (args: { tag?: string }) => {
			const { tag } = args;

			const rateLimit = await checkRateLimit(
				env.RATION_KV,
				"mcp_list",
				env.__orgId,
			);
			if (!rateLimit.allowed) {
				return {
					content: [
						{
							type: "text",
							text: `Rate limit exceeded. Retry after ${rateLimit.retryAfter ?? 60} seconds.`,
						},
					],
				};
			}

			const meals = await getMeals(env.DB, env.__orgId, tag);

			const mapped = meals.map((m) => ({
				id: m.id,
				name: m.name,
				description: m.description,
				type: m.type,
				domain: m.domain,
				servings: m.servings,
				tags: m.tags,
				ingredients: m.ingredients.map((i) => ({
					name: i.ingredientName,
					quantity: i.quantity,
					unit: i.unit,
				})),
			}));

			const MAX_LIST_MEALS = 200;
			const truncated = mapped.length > MAX_LIST_MEALS;
			const items = truncated ? mapped.slice(0, MAX_LIST_MEALS) : mapped;
			const note = truncated
				? `\n\n[Results truncated: showing ${MAX_LIST_MEALS} of ${mapped.length} meals.]`
				: "";

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(items, null, 2) + note,
					},
				],
			};
		},
	);

	// ─── Write Tools ─────────────────────────────────────────────────────────

	/**
	 * Tool: add_supply_item
	 * Adds an item to the active shopping/supply list.
	 */
	server.tool(
		"add_supply_item",
		"Add an item to the active supply/shopping list. Use this when the user wants to add something to buy.",
		{
			name: z.string().min(1).describe("Name of the item to add"),
			quantity: z.number().positive().optional().describe("Quantity to add"),
			unit: z
				.string()
				.optional()
				.describe("Unit of measurement (e.g. 'kg', 'l', 'piece')"),
			domain: z
				.enum(["food", "household", "alcohol"])
				.optional()
				.default("food")
				.describe("Item domain (default: food)"),
		},
		async (args: {
			name: string;
			quantity?: number;
			unit?: string;
			domain?: "food" | "household" | "alcohol";
		}) => {
			const rateLimit = await checkRateLimit(
				env.RATION_KV,
				"mcp_write",
				env.__orgId,
			);
			if (!rateLimit.allowed) {
				return {
					content: [
						{
							type: "text",
							text: `Rate limit exceeded. Retry after ${rateLimit.retryAfter ?? 60} seconds.`,
						},
					],
				};
			}

			try {
				const list = await ensureSupplyList(env.DB, env.__orgId);
				if (!list) {
					return {
						content: [
							{ type: "text", text: "Could not locate or create supply list." },
						],
					};
				}
				const item = await addSupplyItem(env.DB, env.__orgId, list.id, {
					name: args.name,
					quantity: args.quantity,
					unit: args.unit,
					domain: args.domain ?? "food",
				});
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									added: {
										id: item.id,
										name: item.name,
										quantity: item.quantity,
										unit: item.unit,
									},
								},
								null,
								2,
							),
						},
					],
				};
			} catch (e) {
				return {
					content: [
						{
							type: "text",
							text: `Error: ${e instanceof Error ? e.message : String(e)}`,
						},
					],
				};
			}
		},
	);

	/**
	 * Tool: update_supply_item
	 * Updates an existing supply list item's name, quantity, or unit.
	 */
	server.tool(
		"update_supply_item",
		"Update an existing item on the supply list. Provide the itemId (from get_supply_list) and any fields to change.",
		{
			itemId: z
				.string()
				.uuid()
				.describe("ID of the supply list item to update"),
			name: z.string().min(1).optional().describe("New name for the item"),
			quantity: z.number().positive().optional().describe("New quantity"),
			unit: z.string().optional().describe("New unit of measurement"),
		},
		async (args: {
			itemId: string;
			name?: string;
			quantity?: number;
			unit?: string;
		}) => {
			const rateLimit = await checkRateLimit(
				env.RATION_KV,
				"mcp_write",
				env.__orgId,
			);
			if (!rateLimit.allowed) {
				return {
					content: [
						{
							type: "text",
							text: `Rate limit exceeded. Retry after ${rateLimit.retryAfter ?? 60} seconds.`,
						},
					],
				};
			}

			try {
				const list = await ensureSupplyList(env.DB, env.__orgId);
				if (!list) {
					return {
						content: [
							{ type: "text", text: "Could not locate or create supply list." },
						],
					};
				}
				const item = await updateSupplyItem(
					env.DB,
					env.__orgId,
					list.id,
					args.itemId,
					{
						name: args.name,
						quantity: args.quantity,
						unit: args.unit,
					},
				);
				if (!item) {
					return {
						content: [
							{
								type: "text",
								text: `Item ${args.itemId} not found on supply list.`,
							},
						],
					};
				}
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									updated: {
										id: item.id,
										name: item.name,
										quantity: item.quantity,
										unit: item.unit,
									},
								},
								null,
								2,
							),
						},
					],
				};
			} catch (e) {
				return {
					content: [
						{
							type: "text",
							text: `Error: ${e instanceof Error ? e.message : String(e)}`,
						},
					],
				};
			}
		},
	);

	/**
	 * Tool: remove_supply_item
	 * Removes an item from the supply list permanently.
	 */
	server.tool(
		"remove_supply_item",
		"Remove an item from the supply list. Provide the itemId from get_supply_list.",
		{
			itemId: z
				.string()
				.uuid()
				.describe("ID of the supply list item to remove"),
		},
		async (args: { itemId: string }) => {
			const rateLimit = await checkRateLimit(
				env.RATION_KV,
				"mcp_write",
				env.__orgId,
			);
			if (!rateLimit.allowed) {
				return {
					content: [
						{
							type: "text",
							text: `Rate limit exceeded. Retry after ${rateLimit.retryAfter ?? 60} seconds.`,
						},
					],
				};
			}

			try {
				const list = await ensureSupplyList(env.DB, env.__orgId);
				if (!list) {
					return {
						content: [
							{ type: "text", text: "Could not locate or create supply list." },
						],
					};
				}
				await deleteSupplyItem(env.DB, env.__orgId, list.id, args.itemId);
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{ removed: true, itemId: args.itemId },
								null,
								2,
							),
						},
					],
				};
			} catch (e) {
				return {
					content: [
						{
							type: "text",
							text: `Error: ${e instanceof Error ? e.message : String(e)}`,
						},
					],
				};
			}
		},
	);

	/**
	 * Tool: mark_supply_purchased
	 * Marks a supply list item as purchased or unpurchased.
	 */
	server.tool(
		"mark_supply_purchased",
		"Mark a supply list item as purchased or not purchased. Use after buying an item at the store.",
		{
			itemId: z.string().uuid().describe("ID of the supply list item"),
			purchased: z
				.boolean()
				.describe("true to mark as purchased, false to unmark"),
		},
		async (args: { itemId: string; purchased: boolean }) => {
			const rateLimit = await checkRateLimit(
				env.RATION_KV,
				"mcp_write",
				env.__orgId,
			);
			if (!rateLimit.allowed) {
				return {
					content: [
						{
							type: "text",
							text: `Rate limit exceeded. Retry after ${rateLimit.retryAfter ?? 60} seconds.`,
						},
					],
				};
			}

			try {
				const list = await ensureSupplyList(env.DB, env.__orgId);
				if (!list) {
					return {
						content: [
							{ type: "text", text: "Could not locate or create supply list." },
						],
					};
				}
				const item = await updateSupplyItem(
					env.DB,
					env.__orgId,
					list.id,
					args.itemId,
					{
						isPurchased: args.purchased,
					},
				);
				if (!item) {
					return {
						content: [
							{
								type: "text",
								text: `Item ${args.itemId} not found on supply list.`,
							},
						],
					};
				}
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									itemId: item.id,
									name: item.name,
									isPurchased: item.isPurchased,
								},
								null,
								2,
							),
						},
					],
				};
			} catch (e) {
				return {
					content: [
						{
							type: "text",
							text: `Error: ${e instanceof Error ? e.message : String(e)}`,
						},
					],
				};
			}
		},
	);

	/**
	 * Tool: add_cargo_item
	 * Adds a new item to the pantry (Cargo inventory).
	 */
	server.tool(
		"add_cargo_item",
		"Add a new item to the pantry inventory. Use when the user says they bought something or wants to log a new pantry item.",
		{
			name: z.string().min(1).describe("Name of the item"),
			quantity: z.number().positive().describe("Quantity in stock"),
			unit: z
				.string()
				.describe(
					"Unit of measurement (e.g. 'kg', 'g', 'l', 'ml', 'piece', 'pack')",
				),
			domain: z
				.enum(["food", "household", "alcohol"])
				.optional()
				.default("food")
				.describe("Item domain"),
			tags: z
				.array(z.string())
				.optional()
				.default([])
				.describe("Optional tags (e.g. ['dairy', 'frozen'])"),
			expiresAt: z
				.string()
				.optional()
				.describe(
					"Optional expiry date in ISO 8601 format (e.g. '2026-03-15')",
				),
		},
		async (args: {
			name: string;
			quantity: number;
			unit: string;
			domain?: "food" | "household" | "alcohol";
			tags?: string[];
			expiresAt?: string;
		}) => {
			const rateLimit = await checkRateLimit(
				env.RATION_KV,
				"mcp_write",
				env.__orgId,
			);
			if (!rateLimit.allowed) {
				return {
					content: [
						{
							type: "text",
							text: `Rate limit exceeded. Retry after ${rateLimit.retryAfter ?? 60} seconds.`,
						},
					],
				};
			}

			try {
				const unit = toSupportedUnit(args.unit);
				const results = await ingestCargoItems(
					env,
					env.__orgId,
					[
						{
							name: args.name,
							quantity: args.quantity,
							unit,
							domain: args.domain ?? "food",
							tags: args.tags ?? [],
							expiresAt: args.expiresAt ? new Date(args.expiresAt) : undefined,
						},
					],
					// Skip vector embedding via MCP to avoid AI credits cost.
					// Vectors are backfilled asynchronously by the main app indexer.
					{ skipVectorPhase: true },
				);

				const result = results[0];
				if (!result || result.status === "error") {
					return {
						content: [
							{
								type: "text",
								text: `Error adding item: ${result?.error ?? "Unknown error"}`,
							},
						],
					};
				}

				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									status: result.status,
									item: result.item
										? {
												id: result.item.id,
												name: result.item.name,
												quantity: result.item.quantity,
												unit: result.item.unit,
											}
										: undefined,
									mergedInto: result.mergedInto,
								},
								null,
								2,
							),
						},
					],
				};
			} catch (e) {
				return {
					content: [
						{
							type: "text",
							text: `Error: ${e instanceof Error ? e.message : String(e)}`,
						},
					],
				};
			}
		},
	);

	/**
	 * Tool: remove_cargo_item
	 * Removes an item from the pantry inventory entirely.
	 */
	server.tool(
		"remove_cargo_item",
		"Remove an item from the pantry inventory. Use the item ID from list_inventory or search_ingredients.",
		{
			itemId: z.string().uuid().describe("ID of the cargo item to remove"),
		},
		async (args: { itemId: string }) => {
			const rateLimit = await checkRateLimit(
				env.RATION_KV,
				"mcp_write",
				env.__orgId,
			);
			if (!rateLimit.allowed) {
				return {
					content: [
						{
							type: "text",
							text: `Rate limit exceeded. Retry after ${rateLimit.retryAfter ?? 60} seconds.`,
						},
					],
				};
			}

			try {
				await jettisonItem(env, env.__orgId, args.itemId);
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{ removed: true, itemId: args.itemId },
								null,
								2,
							),
						},
					],
				};
			} catch (e) {
				return {
					content: [
						{
							type: "text",
							text: `Error: ${e instanceof Error ? e.message : String(e)}`,
						},
					],
				};
			}
		},
	);

	/**
	 * Tool: consume_meal
	 * Cooks a meal, automatically deducting its ingredients from the pantry.
	 */
	server.tool(
		"consume_meal",
		"Mark a meal as cooked and automatically deduct its ingredients from the pantry inventory. Use when the user says they made or ate a meal. Use list_meals to get meal IDs.",
		{
			mealId: z
				.string()
				.uuid()
				.describe("ID of the meal to cook (from list_meals)"),
			servings: z
				.number()
				.int()
				.positive()
				.optional()
				.describe(
					"Number of servings cooked (defaults to the meal's base servings)",
				),
		},
		async (args: { mealId: string; servings?: number }) => {
			const rateLimit = await checkRateLimit(
				env.RATION_KV,
				"mcp_write",
				env.__orgId,
			);
			if (!rateLimit.allowed) {
				return {
					content: [
						{
							type: "text",
							text: `Rate limit exceeded. Retry after ${rateLimit.retryAfter ?? 60} seconds.`,
						},
					],
				};
			}

			try {
				await cookMeal(env, env.__orgId, args.mealId, {
					servings: args.servings,
				});
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									consumed: true,
									mealId: args.mealId,
									servings: args.servings ?? "default",
									note: "Ingredients have been deducted from your pantry inventory.",
								},
								null,
								2,
							),
						},
					],
				};
			} catch (e) {
				const message = e instanceof Error ? e.message : String(e);
				// Surface insufficient-cargo errors clearly so the AI can relay them
				const isInsufficient = message.startsWith("Insufficient Cargo");
				return {
					content: [
						{
							type: "text",
							text: isInsufficient
								? `Cannot cook meal: ${message}. Check inventory with list_inventory or search_ingredients.`
								: `Error: ${message}`,
						},
					],
				};
			}
		},
	);

	/**
	 * Tool: add_meal_plan_entry
	 * Adds a meal to the active weekly meal plan on a specific date and slot.
	 */
	server.tool(
		"add_meal_plan_entry",
		"Add a meal to the weekly meal plan for a specific date and meal slot. Use list_meals to find meal IDs.",
		{
			mealId: z
				.string()
				.uuid()
				.describe("ID of the meal to add (from list_meals)"),
			date: z
				.string()
				.regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD")
				.describe("Date for the meal plan entry (YYYY-MM-DD format)"),
			slotType: z
				.enum(["breakfast", "lunch", "dinner", "snack"])
				.describe("Meal slot: breakfast, lunch, dinner, or snack"),
			servingsOverride: z
				.number()
				.int()
				.positive()
				.optional()
				.describe("Override the default number of servings for this entry"),
			notes: z
				.string()
				.max(500)
				.optional()
				.describe("Optional notes for this meal plan entry"),
		},
		async (args: {
			mealId: string;
			date: string;
			slotType: "breakfast" | "lunch" | "dinner" | "snack";
			servingsOverride?: number;
			notes?: string;
		}) => {
			const rateLimit = await checkRateLimit(
				env.RATION_KV,
				"mcp_write",
				env.__orgId,
			);
			if (!rateLimit.allowed) {
				return {
					content: [
						{
							type: "text",
							text: `Rate limit exceeded. Retry after ${rateLimit.retryAfter ?? 60} seconds.`,
						},
					],
				};
			}

			try {
				const plan = await ensureMealPlan(env.DB, env.__orgId);
				const entry = await addEntry(env.DB, env.__orgId, plan.id, {
					mealId: args.mealId,
					date: args.date,
					slotType: args.slotType,
					servingsOverride: args.servingsOverride ?? null,
					notes: args.notes ?? null,
				});
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									added: {
										entryId: entry.id,
										mealName: entry.mealName,
										date: entry.date,
										slotType: entry.slotType,
										servings: entry.servingsOverride ?? entry.mealServings,
									},
								},
								null,
								2,
							),
						},
					],
				};
			} catch (e) {
				return {
					content: [
						{
							type: "text",
							text: `Error: ${e instanceof Error ? e.message : String(e)}`,
						},
					],
				};
			}
		},
	);

	// ─── Additional Read Tools ────────────────────────────────────────────────

	/**
	 * Tool: match_meals
	 * Finds meals that can be made with the current pantry inventory.
	 */
	server.tool(
		"match_meals",
		"Find meals that can be made with current pantry inventory. Use 'strict' mode for meals with all ingredients available, 'delta' mode for partial matches showing what's missing.",
		{
			mode: z
				.enum(["strict", "delta"])
				.optional()
				.default("strict")
				.describe(
					"strict = only fully cookable meals; delta = all meals with % match and missing ingredients",
				),
			minMatch: z
				.number()
				.min(0)
				.max(100)
				.optional()
				.default(50)
				.describe(
					"Minimum match percentage for delta mode (0–100, default 50)",
				),
			limit: z
				.number()
				.int()
				.positive()
				.optional()
				.default(10)
				.describe("Maximum number of results to return"),
			tags: z
				.string()
				.optional()
				.describe("Filter by meal tag (e.g. 'vegetarian', 'breakfast')"),
		},
		async (args: {
			mode?: "strict" | "delta";
			minMatch?: number;
			limit?: number;
			tags?: string;
		}) => {
			const rateLimit = await checkRateLimit(
				env.RATION_KV,
				"mcp_search",
				env.__orgId,
			);
			if (!rateLimit.allowed) {
				return {
					content: [
						{
							type: "text",
							text: `Rate limit exceeded. Retry after ${rateLimit.retryAfter ?? 60} seconds.`,
						},
					],
				};
			}

			try {
				const results = await matchMeals(env, env.__orgId, {
					mode: args.mode ?? "strict",
					minMatch: args.minMatch ?? 50,
					limit: args.limit ?? 10,
					tags: args.tags,
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

				if (mapped.length === 0) {
					const hint =
						args.mode === "strict"
							? " Try mode='delta' to see partial matches."
							: "";
					return {
						content: [
							{
								type: "text",
								text: `No meals match the current pantry inventory.${hint}`,
							},
						],
					};
				}

				return {
					content: [{ type: "text", text: JSON.stringify(mapped, null, 2) }],
				};
			} catch (e) {
				return {
					content: [
						{
							type: "text",
							text: `Error: ${e instanceof Error ? e.message : String(e)}`,
						},
					],
				};
			}
		},
	);

	/**
	 * Tool: get_expiring_items
	 * Returns pantry items expiring within a given number of days.
	 */
	server.tool(
		"get_expiring_items",
		"List pantry items that are expiring soon. Useful for reducing food waste and planning rescue meals.",
		{
			days: z
				.number()
				.int()
				.positive()
				.optional()
				.default(7)
				.describe("Number of days to look ahead (default: 7)"),
		},
		async (args: { days?: number }) => {
			const rateLimit = await checkRateLimit(
				env.RATION_KV,
				"mcp_list",
				env.__orgId,
			);
			if (!rateLimit.allowed) {
				return {
					content: [
						{
							type: "text",
							text: `Rate limit exceeded. Retry after ${rateLimit.retryAfter ?? 60} seconds.`,
						},
					],
				};
			}

			try {
				const d1 = drizzle(env.DB);
				const lookaheadDays = args.days ?? 7;
				const now = new Date();
				const cutoff = new Date(
					now.getTime() + lookaheadDays * 24 * 60 * 60 * 1000,
				);

				// Bounded query: items with expiresAt in [now, cutoff]. Rate-limited (mcp_list).
				const expiringItems = await d1
					.select()
					.from(cargo)
					.where(
						and(
							eq(cargo.organizationId, env.__orgId),
							isNotNull(cargo.expiresAt),
							gte(cargo.expiresAt, now),
							lte(cargo.expiresAt, cutoff),
						),
					)
					.orderBy(cargo.expiresAt);

				if (expiringItems.length === 0) {
					return {
						content: [
							{
								type: "text",
								text: `No items expiring in the next ${lookaheadDays} day${lookaheadDays === 1 ? "" : "s"}.`,
							},
						],
					};
				}

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

				return {
					content: [{ type: "text", text: JSON.stringify(mapped, null, 2) }],
				};
			} catch (e) {
				return {
					content: [
						{
							type: "text",
							text: `Error: ${e instanceof Error ? e.message : String(e)}`,
						},
					],
				};
			}
		},
	);

	// ─── Credit Tools ─────────────────────────────────────────────────────────

	/**
	 * Tool: get_credit_balance
	 * Returns the organization's current AI credit balance.
	 */
	server.tool(
		"get_credit_balance",
		"Check how many AI credits remain for your organization. Credits are used for AI features like recipe importing and visual scanning.",
		{},
		async () => {
			const rateLimit = await checkRateLimit(
				env.RATION_KV,
				"mcp_list",
				env.__orgId,
			);
			if (!rateLimit.allowed) {
				return {
					content: [
						{
							type: "text",
							text: `Rate limit exceeded. Retry after ${rateLimit.retryAfter ?? 60} seconds.`,
						},
					],
				};
			}

			try {
				const balance = await checkBalance(env, env.__orgId);
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify({ balance, currency: "credits" }, null, 2),
						},
					],
				};
			} catch (e) {
				return {
					content: [
						{
							type: "text",
							text: `Error: ${e instanceof Error ? e.message : String(e)}`,
						},
					],
				};
			}
		},
	);

	/**
	 * Tool: update_cargo_item
	 * Updates any field on an existing pantry item. RLS-scoped by orgId.
	 * Automatically re-upserts the vector embedding when name changes.
	 */
	server.tool(
		"update_cargo_item",
		"Update a pantry item's name, quantity, unit, expiry date, domain, or tags. Use item IDs from list_inventory or search_ingredients.",
		{
			itemId: z
				.string()
				.uuid()
				.describe("ID of the cargo item to update (from list_inventory)"),
			name: z.string().min(1).optional().describe("New name for the item"),
			quantity: z
				.number()
				.positive()
				.optional()
				.describe("New quantity (e.g. 0.4 for 400ml remaining)"),
			unit: z
				.string()
				.optional()
				.describe(
					"New unit of measurement (e.g. 'kg', 'g', 'l', 'ml', 'piece')",
				),
			domain: z
				.enum(["food", "household", "alcohol"])
				.optional()
				.describe("Item domain"),
			tags: z
				.array(z.string())
				.optional()
				.describe("New tags — replaces existing tags entirely"),
			expiresAt: z
				.string()
				.optional()
				.describe("New expiry date in ISO 8601 format (e.g. '2026-04-01')"),
		},
		async (args: {
			itemId: string;
			name?: string;
			quantity?: number;
			unit?: string;
			domain?: "food" | "household" | "alcohol";
			tags?: string[];
			expiresAt?: string;
		}) => {
			const rateLimit = await checkRateLimit(
				env.RATION_KV,
				"mcp_write",
				env.__orgId,
			);
			if (!rateLimit.allowed) {
				return {
					content: [
						{
							type: "text",
							text: `Rate limit exceeded. Retry after ${rateLimit.retryAfter ?? 60} seconds.`,
						},
					],
				};
			}

			try {
				const unit = args.unit ? toSupportedUnit(args.unit) : undefined;
				const updated = await updateItem(env, env.__orgId, args.itemId, {
					name: args.name,
					quantity: args.quantity,
					unit,
					domain: args.domain,
					tags: args.tags,
					expiresAt: args.expiresAt ? new Date(args.expiresAt) : undefined,
				});

				if (!updated) {
					return {
						content: [
							{ type: "text", text: `Cargo item ${args.itemId} not found.` },
						],
					};
				}

				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									updated: {
										id: updated.id,
										name: updated.name,
										quantity: updated.quantity,
										unit: updated.unit,
										domain: updated.domain,
										expiresAt: updated.expiresAt,
									},
								},
								null,
								2,
							),
						},
					],
				};
			} catch (e) {
				return {
					content: [
						{
							type: "text",
							text: `Error: ${e instanceof Error ? e.message : String(e)}`,
						},
					],
				};
			}
		},
	);
}
