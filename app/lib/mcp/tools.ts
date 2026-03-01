import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getCargo, getCargoByIds } from "../cargo.server";
import { getMeals } from "../meals.server";
import { checkRateLimit } from "../rate-limiter.server";
import { getSupplyList, getSupplyListById } from "../supply.server";
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
			// Intentional full-table scan: agents need the complete inventory to plan
			// meals/shopping. This endpoint is read-only and scoped to the org via RLS.
			const cargo = await getCargo(env.DB, env.__orgId, domain);

			// Map to a more agent-friendly format
			const mapped = cargo.map((c) => ({
				id: c.id,
				name: c.name,
				quantity: c.quantity,
				unit: c.unit,
				domain: c.domain,
				tags: c.tags,
				expiresAt: c.expiresAt,
			}));

			return {
				content: [{ type: "text", text: JSON.stringify(mapped, null, 2) }],
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

			return {
				content: [{ type: "text", text: JSON.stringify(mapped, null, 2) }],
			};
		},
	);
}
