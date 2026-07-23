import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { buildKitchenSummary } from "../../agent/kitchen-summary.server";
import { buildAgentTemporalContext } from "../../agent/temporal-context.server";
import { detectAllergens, parseAllergens } from "../../allergens";
import { getUserSettings } from "../../auth.server";
import {
	type CargoPageCursor,
	getCargoByIds,
	getCargoItem,
	getCargoPage,
	getExpiredCargo,
	getExpiringCargo,
} from "../../cargo.server";
import {
	getMealPlan,
	getTodayISO,
	getWeekEntries,
} from "../../manifest.server";
import { addDays } from "../../manifest-dates";
import { MEAL_MATCH_CANDIDATE_CAP, matchMeals } from "../../matching.server";
import { getMealsPage } from "../../meals.server";
import { getSupplyList, getSupplyListById } from "../../supply.server";
import { getTagsForCargoIds, tagsToSlugs } from "../../tags.server";
import { findSimilarCargoBatch } from "../../vector.server";
import { MCP_SERVER_VERSION } from "../../version";
import {
	decodeCursor,
	decodeInventoryCursor,
	encodeCursor,
	encodeInventoryCursor,
	err,
	ok,
} from "../envelope";
import { mapExpiryCargoItems } from "../expiry-map";
import {
	defineSharedTool,
	type McpToolsEnv,
	registerSharedMcpTool,
} from "../tool-runtime";

const MAX_PAGE_LIMIT = 200;
const MAX_MATCH_MEALS_LIMIT = 50;
const MAX_EXPIRING_DAYS = 90;
const MAX_EXPIRING_ITEMS = 200;
const MAX_EXPIRED_DAYS_BACK = 90;
const DEFAULT_EXPIRED_DAYS_BACK = 30;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

async function resolveExpirationAlertDays(
	db: D1Database,
	userId: string,
	explicitDays?: number,
): Promise<number> {
	if (explicitDays !== undefined) {
		return Math.min(explicitDays, MAX_EXPIRING_DAYS);
	}
	const settings = await getUserSettings(db, userId);
	const fromPrefs = settings.expirationAlertDays ?? 7;
	return Math.min(Math.max(fromPrefs, 1), MAX_EXPIRING_DAYS);
}

export function createReadToolDefs(env: McpToolsEnv) {
	return [
		defineSharedTool({
			name: "get_context",
			description:
				"Return organization id, API key identity, scopes, capabilities, onboarding, a slim kitchen tier/credits snapshot, and suggested next actions. For full pantry/manifest/supply status prefer get_kitchen_summary.",
			inputSchema: z.object({}),
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
				const kitchenFull = await getAgentKitchenSnapshot(
					env,
					ctx.organizationId,
				);
				const kitchen = {
					tier: kitchenFull.tier,
					tierExpired: kitchenFull.tierExpired,
					credits: kitchenFull.credits,
					capacity: {
						cargo: kitchenFull.capacity.cargo,
						meals: kitchenFull.capacity.meals,
					},
				};
				const capabilities = buildGetContextCapabilities(ctx.scopes);
				const suggestedNextActions = buildSuggestedNextActions(
					onboarding,
					capabilities,
					kitchenFull,
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
					temporal: buildAgentTemporalContext(),
					versions: { mcp: MCP_SERVER_VERSION },
					note: "For detailed pantry/manifest/supply status call get_kitchen_summary.",
				});
			},
		}),
		defineSharedTool({
			name: "search_ingredients",
			description:
				"Semantic search for ingredients in the pantry using vector similarity. Useful for finding available ingredients without knowing the exact name.",
			inputSchema: z.object({
				query: z.string().min(1).describe("The ingredient to search for"),
				topK: z
					.number()
					.int()
					.min(1)
					.max(20)
					.optional()
					.describe("Maximum number of results to return (default 5, max 20)"),
			}),
			scopes: ["mcp:read"],
			rateLimitCategory: "mcp_search",
			audit: false,
			handler: async (ctx, a) => {
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
				const scoreByItemId = new Map(matches.map((m) => [m.itemId, m.score]));
				const items = cargoRows.map((c) => ({
					...c,
					matchScore: scoreByItemId.get(c.id) ?? 0,
				}));
				return ok("search_ingredients", { matches: items });
			},
		}),
		defineSharedTool({
			name: "list_inventory",
			description:
				"Retrieve ingredients in the pantry. Cursor-paginated: pass `cursor` from a previous response to fetch the next page. Default limit 100, max 200. Optional UTC expiry filters and expiresAt sort.",
			inputSchema: z.object({
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
				expiresBefore: z
					.string()
					.regex(ISO_DATE, "Must be YYYY-MM-DD format")
					.optional()
					.describe("Include items expiring on or before this UTC date"),
				expiresAfter: z
					.string()
					.regex(ISO_DATE, "Must be YYYY-MM-DD format")
					.optional()
					.describe("Include items expiring on or after this UTC date"),
				sortBy: z
					.enum(["createdAt", "expiresAt"])
					.optional()
					.default("createdAt")
					.describe(
						"Sort order: createdAt (newest first) or expiresAt (soonest first; omits items without expiry)",
					),
			}),
			scopes: ["mcp:read"],
			rateLimitCategory: "mcp_list",
			audit: false,
			handler: async (ctx, a) => {
				const limit = a.limit ?? 100;
				const sortBy = a.sortBy ?? "createdAt";
				const decoded = a.cursor ? decodeInventoryCursor(a.cursor) : null;
				if (a.cursor && !decoded) {
					return err(
						"list_inventory",
						"invalid_input",
						"Malformed cursor; omit it to start from the first page.",
					);
				}
				if (decoded && decoded.sortBy !== sortBy) {
					return err(
						"list_inventory",
						"invalid_input",
						"Cursor sortBy does not match the current sortBy parameter.",
					);
				}
				let pageCursor: CargoPageCursor | null = null;
				if (decoded?.sortBy === "expiresAt" && decoded.expiresAt) {
					pageCursor = {
						sortBy: "expiresAt",
						expiresAt: new Date(decoded.expiresAt),
						id: decoded.id,
					};
				} else if (decoded?.sortBy === "createdAt" && decoded.createdAt) {
					pageCursor = {
						sortBy: "createdAt",
						createdAt: new Date(decoded.createdAt),
						id: decoded.id,
					};
				}
				const { items, nextCursor } = await getCargoPage(
					env.DB,
					ctx.organizationId,
					{
						limit,
						cursor: pageCursor,
						domain: a.domain,
						expiresBefore: a.expiresBefore,
						expiresAfter: a.expiresAfter,
						sortBy,
					},
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
							? encodeInventoryCursor(
									nextCursor.sortBy === "expiresAt"
										? {
												sortBy: "expiresAt",
												expiresAt: nextCursor.expiresAt.toISOString(),
												id: nextCursor.id,
											}
										: {
												sortBy: "createdAt",
												createdAt: nextCursor.createdAt.toISOString(),
												id: nextCursor.id,
											},
								)
							: null,
					},
				});
			},
		}),
		defineSharedTool({
			name: "get_cargo_item",
			description:
				"Fetch one pantry item by id with all fields (tags, expiresAt, customFields). Useful before update_cargo_item.",
			inputSchema: z.object({
				itemId: z.string().uuid().describe("Cargo item id"),
			}),
			scopes: ["mcp:read"],
			rateLimitCategory: "mcp_list",
			audit: false,
			handler: async (ctx, a) => {
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
		}),
		defineSharedTool({
			name: "get_supply_list",
			description:
				"Retrieve the user's active supply list. Each item includes its `id` so it can be referenced by update_supply_item, mark_supply_purchased_bulk, and remove_supply_item.",
			inputSchema: z.object({}),
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
		}),
		defineSharedTool({
			name: "get_meal_plan",
			description:
				"Retrieve the user's weekly meal plan. Returns scheduled meals by date and slot (breakfast, lunch, dinner, snack).",
			inputSchema: z.object({
				startDate: z
					.string()
					.regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD format")
					.optional(),
				days: z.number().int().min(1).max(14).optional().default(7),
			}),
			scopes: ["mcp:read"],
			rateLimitCategory: "mcp_list",
			audit: false,
			handler: async (ctx, a) => {
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
		}),
		defineSharedTool({
			name: "list_meals",
			description:
				"List meals/recipes (cursor-paginated, default limit 100, max 200). Pass includeIngredients:false to skip ingredient fan-out — useful when scanning the index.",
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
			handler: async (ctx, a) => {
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
		}),
		defineSharedTool({
			name: "match_meals",
			description:
				"Find meals that can be made with the current pantry. Use 'strict' for fully cookable, 'delta' to see partial matches with what's missing. When the user has allergens configured, each result includes allergenFlags; use allergenPolicy 'exclude' to omit unsafe meals.",
			inputSchema: z.object({
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
				allergenPolicy: z
					.enum(["flag", "exclude"])
					.optional()
					.default("flag")
					.describe(
						"flag: include allergenFlags on each meal; exclude: omit meals matching user allergens",
					),
			}),
			scopes: ["mcp:read"],
			rateLimitCategory: "mcp_search",
			audit: false,
			handler: async (ctx, a) => {
				const limit = Math.min(a.limit ?? 10, MAX_MATCH_MEALS_LIMIT);
				const settings = await getUserSettings(env.DB, ctx.userId);
				const userAllergens = parseAllergens(settings.allergens);
				const allergenPolicy = a.allergenPolicy ?? "flag";
				const queryLimit =
					allergenPolicy === "exclude" && userAllergens.length > 0
						? Math.min(MAX_MATCH_MEALS_LIMIT, Math.max(limit, limit * 3))
						: limit;
				const results = await matchMeals(env, ctx.organizationId, {
					mode: a.mode ?? "strict",
					minMatch: a.minMatch ?? 50,
					limit: queryLimit,
					preLimit: MEAL_MATCH_CANDIDATE_CAP,
					tags: a.tags,
				});

				const mapped = results
					.map((r) => {
						const ingredientNames = (r.meal.ingredients ?? []).map(
							(i) => i.ingredientName,
						);
						const allergenFlags =
							userAllergens.length > 0
								? detectAllergens(ingredientNames, userAllergens)
								: [];
						return {
							mealId: r.meal.id,
							mealName: r.meal.name,
							matchPercentage: Math.round(r.matchPercentage),
							canMake: r.canMake,
							allergenSafe: allergenFlags.length === 0,
							allergenFlags,
							missingIngredients: r.missingIngredients.map((m) => ({
								name: m.name,
								needed: `${m.requiredQuantity} ${m.unit}`,
								optional: m.isOptional,
							})),
						};
					})
					.filter(
						(row) =>
							allergenPolicy !== "exclude" ||
							userAllergens.length === 0 ||
							row.allergenSafe,
					)
					.slice(0, limit);

				return ok("match_meals", mapped);
			},
		}),
		defineSharedTool({
			name: "get_expiring_items",
			description:
				"List pantry items expiring soon (UTC calendar days). Defaults to the user's expirationAlertDays when days is omitted. Useful for reducing food waste and planning rescue meals.",
			inputSchema: z.object({
				days: z
					.number()
					.int()
					.positive()
					.max(MAX_EXPIRING_DAYS)
					.optional()
					.describe(
						"Lookahead window in UTC calendar days (defaults to user expirationAlertDays, usually 7)",
					),
			}),
			scopes: ["mcp:read"],
			rateLimitCategory: "mcp_list",
			audit: false,
			handler: async (ctx, a) => {
				const now = new Date();
				const lookaheadDays = await resolveExpirationAlertDays(
					env.DB,
					ctx.userId,
					a.days,
				);
				const expiringItems = await getExpiringCargo(
					env.DB,
					ctx.organizationId,
					lookaheadDays,
					MAX_EXPIRING_ITEMS,
					undefined,
					now,
				);
				return ok(
					"get_expiring_items",
					mapExpiryCargoItems(expiringItems, now),
				);
			},
		}),
		defineSharedTool({
			name: "get_expired_items",
			description:
				"List pantry items whose expiry calendar date is before today (UTC). Useful for waste cleanup and confirming what has already expired.",
			inputSchema: z.object({
				daysBack: z
					.number()
					.int()
					.positive()
					.max(MAX_EXPIRED_DAYS_BACK)
					.optional()
					.default(DEFAULT_EXPIRED_DAYS_BACK)
					.describe(
						"How many UTC calendar days back to search (default 30, max 90)",
					),
			}),
			scopes: ["mcp:read"],
			rateLimitCategory: "mcp_list",
			audit: false,
			handler: async (ctx, a) => {
				const now = new Date();
				const daysBack = Math.min(
					a.daysBack ?? DEFAULT_EXPIRED_DAYS_BACK,
					MAX_EXPIRED_DAYS_BACK,
				);
				const expiredItems = await getExpiredCargo(
					env.DB,
					ctx.organizationId,
					daysBack,
					MAX_EXPIRING_ITEMS,
					undefined,
					now,
				);
				return ok("get_expired_items", mapExpiryCargoItems(expiredItems, now));
			},
		}),
		defineSharedTool({
			name: "get_kitchen_summary",
			description:
				"Single-call operational snapshot: temporal context, tier/credits/capacity, cargo stats with expiring/expired previews, meal plan entries, and active supply list preview. Prefer this for 'how is my kitchen?' before fanning out to granular tools.",
			inputSchema: z.object({
				manifestDays: z
					.number()
					.int()
					.min(1)
					.max(7)
					.optional()
					.default(1)
					.describe(
						"Meal plan lookahead in UTC calendar days starting today (default 1, max 7)",
					),
			}),
			scopes: ["mcp:read"],
			rateLimitCategory: "mcp_list",
			audit: false,
			handler: async (ctx, a) => {
				const summary = await buildKitchenSummary(
					env,
					ctx.organizationId,
					ctx.userId,
					{ manifestDays: a.manifestDays ?? 1 },
				);
				return ok("get_kitchen_summary", summary);
			},
		}),
	];
}

export function registerReadTools(server: McpServer, env: McpToolsEnv): void {
	for (const definition of createReadToolDefs(env)) {
		registerSharedMcpTool(server, env, definition);
	}
}
