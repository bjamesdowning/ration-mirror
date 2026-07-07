import { tool } from "ai";
import { z } from "zod";
import {
	getCargoByIds,
	getCargoItem,
	getCargoPage,
	getExpiringCargo,
	ingestCargoItems,
	updateItem,
} from "../cargo.server";
import { getMealPlan, getTodayISO, getWeekEntries } from "../manifest.server";
import { addDays } from "../manifest-dates";
import { matchMeals } from "../matching.server";
import type { McpToolContext } from "../mcp/auth";
import { decodeCursor, encodeCursor, err, ok } from "../mcp/envelope";
import {
	type MakeToolOptions,
	type McpToolsEnv,
	runTool,
} from "../mcp/tool-runtime";
import { getMealsPage } from "../meals.server";
import { getSupplyList, getSupplyListById } from "../supply.server";
import { getTagsForCargoIds, tagsToSlugs } from "../tags.server";
import { toSupportedUnit } from "../units";
import { findSimilarCargoBatch } from "../vector.server";

const MAX_PAGE_LIMIT = 200;
const MAX_EXPIRING_DAYS = 90;
const MAX_EXPIRING_ITEMS = 200;
const MAX_MATCH_MEALS_LIMIT = 50;

export type CopilotToolDef<
	// biome-ignore lint/suspicious/noExplicitAny: AI SDK tool handlers are schema-validated at runtime before execution.
	TArgs extends Record<string, any> = Record<string, any>,
	TData = unknown,
> = MakeToolOptions<TArgs, TData> & {
	description: string;
	inputSchema: z.ZodObject<z.ZodRawShape>;
};

export type CopilotToolContext = Pick<
	McpToolContext,
	"organizationId" | "userId" | "scopes" | "preClaim"
>;

export function buildCopilotMcpContext(
	ctx: CopilotToolContext,
): McpToolContext {
	return {
		organizationId: ctx.organizationId,
		userId: ctx.userId,
		scopes: ctx.scopes,
		preClaim: ctx.preClaim,
		authMethod: "oauth",
		apiKeyId: `copilot:${ctx.userId}`,
		keyName: "Ration Copilot",
		keyPrefix: "copilot_",
	};
}

function envWithCopilotContext(
	env: Cloudflare.Env,
	ctx: CopilotToolContext,
): McpToolsEnv {
	return {
		...env,
		__mcp: buildCopilotMcpContext(ctx),
	} as McpToolsEnv;
}

export const COPILOT_MCP_SCOPES = [
	"mcp:read",
	"mcp:inventory:write",
	"mcp:galley:write",
	"mcp:manifest:write",
	"mcp:supply:write",
	"mcp:preferences:write",
] as const;

async function searchAiSearchInstance(
	env: Cloudflare.Env,
	instanceName: string,
	query: string,
) {
	const binding = env.AI_SEARCH as
		| {
				search?: (request: unknown) => Promise<unknown>;
		  }
		| undefined;
	if (!binding?.search) {
		throw new Error("AI Search binding is not available");
	}
	return binding.search({
		messages: [{ role: "user", content: query }],
		ai_search_options: {
			instance_ids: [instanceName],
			retrieval_type: "hybrid",
			reranking: { enabled: true },
		},
	});
}

export function createCopilotToolDefs(
	env: Cloudflare.Env,
): Array<CopilotToolDef> {
	return [
		{
			name: "search_docs",
			description:
				"Search official Ration support docs and blog content. Use before answering questions about how the app works.",
			inputSchema: z.object({
				query: z.string().min(1),
				sources: z.array(z.enum(["docs", "blog"])).optional(),
			}),
			scopes: ["mcp:read"],
			rateLimitCategory: "mcp_search",
			audit: false,
			handler: async (_ctx, args) => {
				const sources = args.sources ?? ["docs", "blog"];
				try {
					const results = await Promise.all(
						sources.map(async (source: "docs" | "blog") => ({
							source,
							result: await searchAiSearchInstance(
								env,
								source === "docs" ? "ration-docs" : "ration-blog",
								args.query,
							),
						})),
					);
					return ok("search_docs", { query: args.query, results });
				} catch {
					return err(
						"search_docs",
						"internal_error",
						"Ration Copilot knowledge search is unavailable.",
					);
				}
			},
		},
		{
			name: "search_ingredients",
			description:
				"Semantic search for ingredients in the user's pantry using vector similarity.",
			inputSchema: z.object({
				query: z.string().min(1),
				topK: z.number().int().min(1).max(20).optional(),
			}),
			scopes: ["mcp:read"],
			rateLimitCategory: "mcp_search",
			audit: false,
			handler: async (ctx, args) => {
				const results = await findSimilarCargoBatch(
					env,
					ctx.organizationId,
					[args.query],
					{ topK: args.topK ?? 5, threshold: 0.6 },
				);
				const matches = results.get(args.query) ?? [];
				if (matches.length === 0)
					return ok("search_ingredients", { matches: [] });
				const cargoRows = await getCargoByIds(
					env.DB,
					ctx.organizationId,
					matches.map((m) => m.itemId),
				);
				const scoreByItemId = new Map(matches.map((m) => [m.itemId, m.score]));
				return ok("search_ingredients", {
					matches: cargoRows.map((item) => ({
						...item,
						matchScore: scoreByItemId.get(item.id) ?? 0,
					})),
				});
			},
		},
		{
			name: "list_inventory",
			description:
				"Retrieve pantry items. Cursor-paginated; pass cursor from a previous response for the next page.",
			inputSchema: z.object({
				domain: z.enum(["food", "household", "alcohol"]).optional(),
				limit: z.number().int().min(1).max(MAX_PAGE_LIMIT).optional(),
				cursor: z.string().optional(),
			}),
			scopes: ["mcp:read"],
			rateLimitCategory: "mcp_list",
			audit: false,
			handler: async (ctx, args) => {
				const decoded = args.cursor ? decodeCursor(args.cursor) : null;
				if (args.cursor && !decoded) {
					return err(
						"list_inventory",
						"invalid_input",
						"Malformed cursor; omit it to start from the first page.",
					);
				}
				const { items, nextCursor } = await getCargoPage(
					env.DB,
					ctx.organizationId,
					{
						limit: args.limit ?? 100,
						cursor: decoded
							? { createdAt: new Date(decoded.createdAt), id: decoded.id }
							: null,
						domain: args.domain,
					},
				);
				const tagMap = await getTagsForCargoIds(
					env.DB,
					items.map((item) => item.id),
				);
				return ok(
					"list_inventory",
					items.map((item) => ({
						id: item.id,
						name: item.name,
						quantity: item.quantity,
						unit: item.unit,
						domain: item.domain,
						tags: tagsToSlugs(tagMap.get(item.id) ?? []),
						expiresAt: item.expiresAt,
					})),
					{
						meta: {
							nextCursor: nextCursor
								? encodeCursor({
										createdAt: nextCursor.createdAt.toISOString(),
										id: nextCursor.id,
									})
								: null,
						},
					},
				);
			},
		},
		{
			name: "get_cargo_item",
			description: "Fetch one pantry item by id.",
			inputSchema: z.object({ itemId: z.string().uuid() }),
			scopes: ["mcp:read"],
			rateLimitCategory: "mcp_list",
			audit: false,
			handler: async (ctx, args) => {
				const item = await getCargoItem(
					env.DB,
					ctx.organizationId,
					args.itemId,
				);
				if (!item) {
					return err("get_cargo_item", "not_found", "Cargo item not found.");
				}
				return ok("get_cargo_item", item);
			},
		},
		{
			name: "get_expiring_items",
			description: "List pantry items expiring soon.",
			inputSchema: z.object({
				days: z.number().int().positive().max(MAX_EXPIRING_DAYS).optional(),
			}),
			scopes: ["mcp:read"],
			rateLimitCategory: "mcp_list",
			audit: false,
			handler: async (ctx, args) => {
				const now = new Date();
				const expiringItems = await getExpiringCargo(
					env.DB,
					ctx.organizationId,
					Math.min(args.days ?? 7, MAX_EXPIRING_DAYS),
					MAX_EXPIRING_ITEMS,
				);
				return ok(
					"get_expiring_items",
					expiringItems.map((item) => {
						const expiresAt = item.expiresAt ? new Date(item.expiresAt) : null;
						return {
							id: item.id,
							name: item.name,
							quantity: item.quantity,
							unit: item.unit,
							expiresAt: item.expiresAt,
							daysUntilExpiry: expiresAt
								? Math.ceil(
										(expiresAt.getTime() - now.getTime()) /
											(1000 * 60 * 60 * 24),
									)
								: null,
						};
					}),
				);
			},
		},
		{
			name: "get_supply_list",
			description: "Retrieve the active supply list.",
			inputSchema: z.object({}),
			scopes: ["mcp:read"],
			rateLimitCategory: "mcp_list",
			audit: false,
			handler: async (ctx) => {
				const list = await getSupplyList(env.DB, ctx.organizationId);
				if (!list) return ok("get_supply_list", null);
				const fullList = await getSupplyListById(
					env.DB,
					ctx.organizationId,
					list.id,
				);
				if (!fullList) return ok("get_supply_list", null);
				return ok("get_supply_list", {
					id: fullList.id,
					name: fullList.name,
					items: fullList.items.map((item) => ({
						id: item.id,
						name: item.name,
						quantity: item.quantity,
						unit: item.unit,
						domain: item.domain,
						isPurchased: item.isPurchased,
						sourceMeals: item.sourceMealNames,
					})),
				});
			},
		},
		{
			name: "get_meal_plan",
			description: "Retrieve scheduled meals by date and slot.",
			inputSchema: z.object({
				startDate: z
					.string()
					.regex(/^\d{4}-\d{2}-\d{2}$/)
					.optional(),
				days: z.number().int().min(1).max(14).optional(),
			}),
			scopes: ["mcp:read"],
			rateLimitCategory: "mcp_list",
			audit: false,
			handler: async (ctx, args) => {
				const plan = await getMealPlan(env.DB, ctx.organizationId);
				if (!plan) return ok("get_meal_plan", null);
				const startDate = args.startDate ?? getTodayISO();
				const days = args.days ?? 7;
				const entries = await getWeekEntries(
					env.DB,
					plan.id,
					startDate,
					addDays(startDate, days - 1),
				);
				return ok("get_meal_plan", {
					planId: plan.id,
					planName: plan.name,
					startDate,
					endDate: addDays(startDate, days - 1),
					entries: entries.map((entry) => ({
						id: entry.id,
						date: entry.date,
						slotType: entry.slotType,
						mealId: entry.mealId,
						mealName: entry.mealName,
						servings: entry.servingsOverride ?? entry.mealServings,
						notes: entry.notes,
						consumedAt: entry.consumedAt,
					})),
				});
			},
		},
		{
			name: "list_meals",
			description: "List meals and recipes.",
			inputSchema: z.object({
				tag: z.string().optional(),
				domain: z.enum(["food", "household", "alcohol"]).optional(),
				limit: z.number().int().min(1).max(MAX_PAGE_LIMIT).optional(),
				cursor: z.string().optional(),
				includeIngredients: z.boolean().optional(),
			}),
			scopes: ["mcp:read"],
			rateLimitCategory: "mcp_list",
			audit: false,
			handler: async (ctx, args) => {
				const decoded = args.cursor ? decodeCursor(args.cursor) : null;
				if (args.cursor && !decoded) {
					return err("list_meals", "invalid_input", "Malformed cursor.");
				}
				const { items, nextCursor } = await getMealsPage(
					env.DB,
					ctx.organizationId,
					{
						limit: args.limit ?? 100,
						cursor: decoded
							? { createdAt: new Date(decoded.createdAt), id: decoded.id }
							: null,
						tag: args.tag,
						domain: args.domain,
						includeIngredients: args.includeIngredients ?? true,
					},
				);
				return ok(
					"list_meals",
					items.map((meal) => ({
						id: meal.id,
						name: meal.name,
						domain: meal.domain,
						description: meal.description ?? undefined,
						servings: meal.servings ?? 1,
						tags: meal.tags,
						ingredients: meal.ingredients.map((ingredient) => ({
							ingredientName: ingredient.ingredientName,
							quantity: ingredient.quantity,
							unit: ingredient.unit,
							isOptional: ingredient.isOptional ?? false,
						})),
					})),
					{
						meta: {
							nextCursor: nextCursor
								? encodeCursor({
										createdAt: nextCursor.createdAt.toISOString(),
										id: nextCursor.id,
									})
								: null,
						},
					},
				);
			},
		},
		{
			name: "match_meals",
			description:
				"Find meals that can be made with current pantry ingredients.",
			inputSchema: z.object({
				mode: z.enum(["strict", "delta"]).optional(),
				minMatch: z.number().min(0).max(100).optional(),
				limit: z
					.number()
					.int()
					.positive()
					.max(MAX_MATCH_MEALS_LIMIT)
					.optional(),
				tags: z.string().optional(),
			}),
			scopes: ["mcp:read"],
			rateLimitCategory: "mcp_search",
			audit: false,
			handler: async (ctx, args) => {
				const results = await matchMeals(env, ctx.organizationId, {
					mode: args.mode ?? "strict",
					minMatch: args.minMatch ?? 50,
					limit: Math.min(args.limit ?? 10, MAX_MATCH_MEALS_LIMIT),
					preLimit: 200,
					tags: args.tags,
				});
				return ok(
					"match_meals",
					results.map((result) => ({
						mealId: result.meal.id,
						mealName: result.meal.name,
						matchPercentage: Math.round(result.matchPercentage),
						canMake: result.canMake,
						missingIngredients: result.missingIngredients.map((missing) => ({
							name: missing.name,
							needed: `${missing.requiredQuantity} ${missing.unit}`,
							optional: missing.isOptional,
						})),
					})),
				);
			},
		},
		{
			name: "add_cargo_item",
			description:
				"Add a deterministic pantry item. Does not run receipt scanning or image AI.",
			inputSchema: z.object({
				name: z.string().min(1),
				quantity: z.number().positive(),
				unit: z.string().min(1),
				domain: z.enum(["food", "household", "alcohol"]).optional(),
				tags: z.array(z.string()).optional(),
				expiresAt: z.string().optional(),
			}),
			scopes: ["mcp:inventory:write"],
			rateLimitCategory: "mcp_write",
			audit: true,
			handler: async (ctx, args) => {
				const results = await ingestCargoItems(
					env,
					ctx.organizationId,
					[
						{
							name: args.name,
							quantity: args.quantity,
							unit: toSupportedUnit(args.unit),
							domain: args.domain ?? "food",
							tags: args.tags ?? [],
							expiresAt: args.expiresAt ? new Date(args.expiresAt) : undefined,
						},
					],
					{ skipVectorPhase: true },
				);
				const result = results[0];
				if (!result || result.status === "error") {
					return err(
						"add_cargo_item",
						"internal_error",
						result?.error ?? "Unknown ingest error",
					);
				}
				if (result.status === "capacity_exceeded") {
					return err(
						"add_cargo_item",
						"capacity_exceeded",
						"Tier limit reached. Upgrade or remove items.",
					);
				}
				return ok("add_cargo_item", {
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
				});
			},
		},
		{
			name: "update_cargo_item",
			description: "Update a pantry item's fields.",
			inputSchema: z.object({
				itemId: z.string().uuid(),
				name: z.string().min(1).optional(),
				quantity: z.number().positive().optional(),
				unit: z.string().optional(),
				domain: z.enum(["food", "household", "alcohol"]).optional(),
				tags: z.array(z.string()).optional(),
				expiresAt: z.string().optional(),
			}),
			scopes: ["mcp:inventory:write"],
			rateLimitCategory: "mcp_write",
			audit: true,
			handler: async (ctx, args) => {
				const updated = await updateItem(env, ctx.organizationId, args.itemId, {
					name: args.name,
					quantity: args.quantity,
					unit: args.unit ? toSupportedUnit(args.unit) : undefined,
					domain: args.domain,
					tags: args.tags,
					expiresAt: args.expiresAt ? new Date(args.expiresAt) : undefined,
				});
				if (!updated) {
					return err("update_cargo_item", "not_found", "Cargo item not found.");
				}
				return ok("update_cargo_item", {
					id: updated.id,
					name: updated.name,
					quantity: updated.quantity,
					unit: updated.unit,
					domain: updated.domain,
					expiresAt: updated.expiresAt,
				});
			},
		},
	];
}

export function toAiSdkTools(env: Cloudflare.Env, ctx: CopilotToolContext) {
	const toolEnv = envWithCopilotContext(env, ctx);
	const defs = createCopilotToolDefs(env);

	return Object.fromEntries(
		defs.map((def) => [
			def.name,
			tool({
				description: def.description,
				inputSchema: def.inputSchema,
				execute: async (args) => {
					const envelope = await runTool(toolEnv, def, args);
					if (!envelope.ok) {
						throw new Error(
							`${envelope.error.code}: ${envelope.error.message}`,
						);
					}
					return envelope.data;
				},
			}),
		]),
	);
}
