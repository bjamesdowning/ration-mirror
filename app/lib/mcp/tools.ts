import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { and, eq, gte, isNotNull, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { z } from "zod";
import { cargo, mealPlanEntry } from "../../db/schema";
import {
	getCargo,
	getCargoByIds,
	ingestCargoItems,
	jettisonItem,
	updateItem,
} from "../cargo.server";
import { checkBalance } from "../ledger.server";
import {
	addEntry,
	deleteEntry,
	ensureMealPlan,
	getMealPlan,
	getTodayISO,
	getWeekEntries,
	updateEntry,
} from "../manifest.server";
import { addDays } from "../manifest-dates";
import { matchMeals } from "../matching.server";
import { cookMeal, createMeal, getMeals, updateMeal } from "../meals.server";
import { checkRateLimit } from "../rate-limiter.server";
import { McpCreateMealSchema, MealUpdateSchema } from "../schemas/meal";
import {
	addSupplyItem,
	createSupplyListFromSelectedMeals,
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
	 * Tool: get_meal_plan
	 * Retrieves the user's weekly meal plan entries for a date range.
	 */
	server.tool(
		"get_meal_plan",
		"Retrieve the user's weekly meal plan. Returns scheduled meals by date and slot (breakfast, lunch, dinner, snack).",
		{
			startDate: z
				.string()
				.regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD format")
				.optional()
				.describe("Start date for the range (default: today)"),
			days: z
				.number()
				.int()
				.min(1)
				.max(14)
				.optional()
				.default(7)
				.describe(
					"Number of days from startDate to include (default 7, max 14)",
				),
		},
		async (args: { startDate?: string; days?: number }) => {
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

			const plan = await getMealPlan(env.DB, env.__orgId);
			if (!plan) {
				return {
					content: [{ type: "text", text: "No active meal plan found." }],
				};
			}

			const startDate = args.startDate ?? getTodayISO();
			const days = args.days ?? 7;
			const endDate = addDays(startDate, days - 1);

			const entries = await getWeekEntries(env.DB, plan.id, startDate, endDate);

			const mapped = {
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

	/**
	 * Tool: remove_meal_plan_entry
	 * Deletes a scheduled meal from the plan. Use entry id from get_meal_plan.
	 */
	server.tool(
		"remove_meal_plan_entry",
		"Remove a meal from the weekly plan. Provide entryId from get_meal_plan entries[].id.",
		{
			entryId: z
				.string()
				.uuid()
				.describe("Meal plan entry ID from get_meal_plan"),
		},
		async (args: { entryId: string }) => {
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
				const removed = await deleteEntry(
					env.DB,
					env.__orgId,
					plan.id,
					args.entryId,
				);
				if (!removed) {
					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(
									{
										removed: false,
										reason: "Entry not found on your active meal plan.",
									},
									null,
									2,
								),
							},
						],
					};
				}
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{ removed: true, entryId: args.entryId },
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
	 * Tool: update_meal_plan_entry
	 * Patch date, slot, servings override, notes, or order for a plan entry.
	 */
	server.tool(
		"update_meal_plan_entry",
		"Update an existing meal plan entry (date, slot, servings, notes). Get entryId from get_meal_plan. Cannot change consumed entries.",
		{
			entryId: z
				.string()
				.uuid()
				.describe("Meal plan entry ID from get_meal_plan"),
			date: z
				.string()
				.regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD")
				.optional()
				.describe("New date for this entry"),
			slotType: z
				.enum(["breakfast", "lunch", "dinner", "snack"])
				.optional()
				.describe("Meal slot"),
			servingsOverride: z
				.number()
				.int()
				.positive()
				.optional()
				.describe(
					"Override servings for this occurrence (omit to clear override)",
				),
			clearServingsOverride: z
				.boolean()
				.optional()
				.describe(
					"Set true to clear servingsOverride and use the recipe default",
				),
			notes: z.string().max(500).optional().describe("Notes for this entry"),
			orderIndex: z
				.number()
				.int()
				.nonnegative()
				.optional()
				.describe("Sort order within the same day and slot"),
		},
		async (args: {
			entryId: string;
			date?: string;
			slotType?: "breakfast" | "lunch" | "dinner" | "snack";
			servingsOverride?: number;
			clearServingsOverride?: boolean;
			notes?: string;
			orderIndex?: number;
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

			const hasPatch =
				args.date !== undefined ||
				args.slotType !== undefined ||
				args.servingsOverride !== undefined ||
				args.clearServingsOverride === true ||
				args.notes !== undefined ||
				args.orderIndex !== undefined;
			if (!hasPatch) {
				return {
					content: [
						{
							type: "text",
							text: "Provide at least one of: date, slotType, servingsOverride, clearServingsOverride, notes, orderIndex.",
						},
					],
				};
			}

			try {
				const plan = await ensureMealPlan(env.DB, env.__orgId);
				const d1 = drizzle(env.DB);
				const [existing] = await d1
					.select({ consumedAt: mealPlanEntry.consumedAt })
					.from(mealPlanEntry)
					.where(
						and(
							eq(mealPlanEntry.id, args.entryId),
							eq(mealPlanEntry.planId, plan.id),
						),
					)
					.limit(1);

				if (!existing) {
					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(
									{
										updated: false,
										reason: "Entry not found on your active meal plan.",
									},
									null,
									2,
								),
							},
						],
					};
				}
				if (existing.consumedAt != null) {
					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(
									{
										updated: false,
										reason:
											"This entry is already marked consumed; remove it or edit unconsumed entries only.",
									},
									null,
									2,
								),
							},
						],
					};
				}

				const input: {
					date?: string;
					slotType?: string;
					orderIndex?: number;
					servingsOverride?: number | null;
					notes?: string | null;
				} = {};
				if (args.date !== undefined) input.date = args.date;
				if (args.slotType !== undefined) input.slotType = args.slotType;
				if (args.orderIndex !== undefined) input.orderIndex = args.orderIndex;
				if (args.clearServingsOverride === true) {
					input.servingsOverride = null;
				} else if (args.servingsOverride !== undefined) {
					input.servingsOverride = args.servingsOverride;
				}
				if (args.notes !== undefined) input.notes = args.notes;

				const updated = await updateEntry(
					env.DB,
					env.__orgId,
					plan.id,
					args.entryId,
					input,
				);

				if (!updated) {
					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(
									{ updated: false, reason: "Update failed." },
									null,
									2,
								),
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
										entryId: updated.id,
										date: updated.date,
										slotType: updated.slotType,
										mealName: updated.mealName,
										servings: updated.servingsOverride ?? updated.mealServings,
										notes: updated.notes,
										orderIndex: updated.orderIndex,
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
	 * Tool: sync_supply_from_selected_meals
	 * Rebuilds the active supply list from Manifest (current week) + Galley selections — same as the Supply page “Update list”.
	 */
	server.tool(
		"sync_supply_from_selected_meals",
		"Rebuild the shopping list from this week's meal plan entries plus Galley active selections (same as Supply → Update list). Uses semantic matching vs pantry for gaps; may call Vectorize. For one-off items use add_supply_item. unitMode defaults to metric (web uses per-user supply preference).",
		{
			unitMode: z
				.enum(["metric", "imperial"])
				.optional()
				.describe("Shopping list units (default: metric)"),
		},
		async (args: { unitMode?: "metric" | "imperial" }) => {
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
				const result = await createSupplyListFromSelectedMeals(
					env,
					env.__orgId,
					undefined,
					{
						trigger: "mcp_sync_supply",
						organizationId: env.__orgId,
					},
					args.unitMode ?? "metric",
				);

				const list = result.list;
				if (!list) {
					return {
						content: [
							{
								type: "text",
								text: "Error: supply sync did not return a list.",
							},
						],
					};
				}

				const fullList = await getSupplyListById(env.DB, env.__orgId, list.id);

				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									listId: list.id,
									summary: result.summary,
									itemCount: fullList?.items.length ?? 0,
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
	 * Tool: create_meal
	 * Creates a new Galley recipe (not AI-generated). Respects org meal capacity limits.
	 */
	server.tool(
		"create_meal",
		"Create a new recipe in the Galley. Same fields as list_meals output shape (without id). For bulk import use REST POST /api/v1/galley/import with galley scope. AI recipe generation stays in the Ration app only.",
		{
			meal: McpCreateMealSchema.describe(
				"New meal: name, domain, servings, ingredients, optional tags/directions/equipment.",
			),
		},
		async (args: { meal: z.infer<typeof McpCreateMealSchema> }) => {
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
				const parsed = McpCreateMealSchema.parse(args.meal);
				const created = await createMeal(env.DB, env.__orgId, parsed, env);
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									created: {
										id: created?.id,
										name: created?.name,
										servings: created?.servings,
										ingredientCount: created?.ingredients.length ?? 0,
										tags: created?.tags ?? [],
									},
								},
								null,
								2,
							),
						},
					],
				};
			} catch (e) {
				const message = e instanceof Error ? e.message : String(e);
				if (message.startsWith("capacity_exceeded")) {
					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(
									{
										error: "capacity_exceeded",
										detail: message,
										hint: "Upgrade tier or remove recipes in Settings.",
									},
									null,
									2,
								),
							},
						],
					};
				}
				return {
					content: [{ type: "text", text: `Error: ${message}` }],
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

	/**
	 * Tool: update_meal
	 * Updates any aspect of a Galley recipe. Full round-trip: fetch via list_meals,
	 * modify fields, pass complete meal object (including id).
	 */
	server.tool(
		"update_meal",
		"Update any aspect of a Galley recipe. Use list_meals to fetch the full meal, modify the fields you need to change, then pass the complete meal object (including id). Can update name, description, directions, ingredients, tags, servings, prep time, cook time, and more.",
		{
			meal: MealUpdateSchema.describe(
				"Full meal object from list_meals with desired modifications. Must include id.",
			),
		},
		async (args: { meal: z.infer<typeof MealUpdateSchema> }) => {
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
				const parsed = MealUpdateSchema.parse(args.meal);
				const { id, ...mealInput } = parsed;
				const updated = await updateMeal(env.DB, env.__orgId, id, mealInput);
				if (!updated) {
					return {
						content: [
							{ type: "text", text: "Meal not found or unauthorized." },
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
										domain: updated.domain,
										description: updated.description,
										servings: updated.servings,
										ingredients: updated.ingredients.map((i) => ({
											ingredientName: i.ingredientName,
											quantity: i.quantity,
											unit: i.unit,
										})),
										tags: updated.tags,
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
