import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { and, eq, gte, isNotNull, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { z } from "zod";
import { cargo, mealPlanEntry } from "../../db/schema";
import { getUserSettings, patchUserSettings } from "../auth.server";
import {
	getCargoByIds,
	getCargoItem,
	getCargoPage,
	ingestCargoItems,
	jettisonItem,
	updateItem,
} from "../cargo.server";
import {
	applyInventoryImport,
	getInventoryImportSchema,
	type InventoryImportItem,
	importInventoryCsv,
	previewInventoryImport,
} from "../inventory-import.server";
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
import {
	clearMealSelections,
	getActiveMealSelections,
	upsertMealSelection,
	validateMealOwnership,
} from "../meal-selection.server";
import {
	cookMeal,
	createMeal,
	deleteMeal,
	getMealsPage,
	updateMeal,
} from "../meals.server";
import { checkRateLimit } from "../rate-limiter.server";
import { McpCreateMealSchema, MealUpdateSchema } from "../schemas/meal";
import {
	addSupplyItem,
	completeSupplyList,
	createSupplyListFromSelectedMeals,
	deleteSupplyItem,
	ensureSupplyList,
	getSupplyList,
	getSupplyListById,
	updateSupplyItem,
} from "../supply.server";
import { toSupportedUnit } from "../units";
import { findSimilarCargoBatch } from "../vector.server";
import { auditMcpWrite } from "./audit";
import type { McpToolContext } from "./auth";
import {
	decodeCursor,
	encodeCursor,
	err,
	mapErrorToEnvelope,
	ok,
	rateLimited,
	type ToolEnvelope,
	toolReply,
} from "./envelope";
import { registerResourcesAndPrompts } from "./resources";
import { hasScope, McpScopeError, requireScope } from "./scopes";

const MAX_PAGE_LIMIT = 200;

/**
 * Wrap a tool handler to enforce scope, rate limit, audit logging, and the
 * standard error envelope. Read-tools and write-tools both go through this.
 */
function makeTool<TArgs, TData>(opts: {
	name: string;
	scopes: Parameters<typeof requireScope>[1];
	rateLimitCategory:
		| "mcp_list"
		| "mcp_search"
		| "mcp_write"
		| "mcp_supply_sync"
		| null;
	audit: boolean;
	handler: (ctx: McpToolContext, args: TArgs) => Promise<ToolEnvelope<TData>>;
}): (
	env: Cloudflare.Env & { __mcp: McpToolContext },
	args: TArgs,
) => Promise<{ content: Array<{ type: "text"; text: string }> }> {
	return async (env, args) => {
		const ctx = env.__mcp;
		const startedAt = Date.now();

		try {
			requireScope(ctx, opts.scopes);
		} catch (e) {
			if (e instanceof McpScopeError) {
				return toolReply(
					opts.name,
					err(opts.name, "insufficient_scope", e.message, {
						details: { required: e.required },
					}),
				);
			}
			throw e;
		}

		if (opts.rateLimitCategory) {
			const orgRl = await checkRateLimit(
				env.RATION_KV,
				opts.rateLimitCategory,
				ctx.organizationId,
			);
			if (!orgRl.allowed) {
				if (opts.audit) {
					auditMcpWrite(ctx, {
						tool: opts.name,
						outcome: "error",
						errorCode: "rate_limited",
						durationMs: Date.now() - startedAt,
					});
				}
				return toolReply(
					opts.name,
					rateLimited(opts.name, orgRl.retryAfter ?? 60),
				);
			}
			// Per-API-key cap on write categories — defends against a stolen key.
			if (opts.rateLimitCategory === "mcp_write") {
				const keyRl = await checkRateLimit(
					env.RATION_KV,
					"mcp_write_per_key",
					ctx.apiKeyId,
				);
				if (!keyRl.allowed) {
					if (opts.audit) {
						auditMcpWrite(ctx, {
							tool: opts.name,
							outcome: "error",
							errorCode: "rate_limited",
							durationMs: Date.now() - startedAt,
						});
					}
					return toolReply(
						opts.name,
						rateLimited(opts.name, keyRl.retryAfter ?? 60),
					);
				}
			}
		}

		try {
			const envelope = await opts.handler(ctx, args);
			if (opts.audit) {
				auditMcpWrite(ctx, {
					tool: opts.name,
					outcome: envelope.ok ? "ok" : "error",
					errorCode: envelope.ok ? undefined : envelope.error.code,
					durationMs: Date.now() - startedAt,
				});
			}
			return toolReply(opts.name, envelope);
		} catch (e) {
			const envelope = mapErrorToEnvelope(opts.name, e);
			if (opts.audit) {
				auditMcpWrite(ctx, {
					tool: opts.name,
					outcome: "error",
					errorCode: envelope.ok ? undefined : envelope.error.code,
					durationMs: Date.now() - startedAt,
				});
			}
			return toolReply(opts.name, envelope);
		}
	};
}

export function registerTools(
	server: McpServer,
	env: Cloudflare.Env & { __mcp: McpToolContext; __orgId: string },
): void {
	// Register read-only resources and prompts (no auth context needed —
	// reference data is the same for every key).
	registerResourcesAndPrompts(server);

	// ─── Read Tools ──────────────────────────────────────────────────────────

	server.tool(
		"get_context",
		"Return the calling agent's organization id, API key id (prefix), authorized scopes, and tool capabilities. Always safe to call first to introspect what the key can do.",
		{},
		async () =>
			makeTool({
				name: "get_context",
				scopes: ["mcp:read"],
				rateLimitCategory: "mcp_list",
				audit: false,
				handler: async (ctx) =>
					ok("get_context", {
						organizationId: ctx.organizationId,
						apiKeyId: ctx.apiKeyId,
						keyName: ctx.keyName,
						keyPrefix: ctx.keyPrefix,
						scopes: ctx.scopes,
						capabilities: {
							canRead: hasScope(ctx, "mcp:read"),
							canWriteInventory: hasScope(ctx, "mcp:inventory:write"),
							canWriteGalley: hasScope(ctx, "mcp:galley:write"),
							canWriteManifest: hasScope(ctx, "mcp:manifest:write"),
							canWriteSupply: hasScope(ctx, "mcp:supply:write"),
							canWritePreferences: hasScope(ctx, "mcp:preferences:write"),
						},
						versions: { mcp: "1.1.0" },
					}),
			})(env, {}),
	);

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

	server.tool(
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
					const mapped = items.map((c) => ({
						id: c.id,
						name: c.name,
						quantity: c.quantity,
						unit: c.unit,
						domain: c.domain,
						tags: c.tags,
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

	server.tool(
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

	server.tool(
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

	server.tool(
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

	server.tool(
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

	server.tool(
		"match_meals",
		"Find meals that can be made with the current pantry. Use 'strict' for fully cookable, 'delta' to see partial matches with what's missing.",
		{
			mode: z.enum(["strict", "delta"]).optional().default("strict"),
			minMatch: z.number().min(0).max(100).optional().default(50),
			limit: z.number().int().positive().optional().default(10),
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
					const results = await matchMeals(env, ctx.organizationId, {
						mode: a.mode ?? "strict",
						minMatch: a.minMatch ?? 50,
						limit: a.limit ?? 10,
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

	server.tool(
		"get_expiring_items",
		"List pantry items that are expiring soon. Useful for reducing food waste and planning rescue meals.",
		{
			days: z.number().int().positive().optional().default(7),
		},
		async (args: { days?: number }) =>
			makeTool({
				name: "get_expiring_items",
				scopes: ["mcp:read"],
				rateLimitCategory: "mcp_list",
				audit: false,
				handler: async (ctx, a: typeof args) => {
					const d1 = drizzle(env.DB);
					const lookaheadDays = a.days ?? 7;
					const now = new Date();
					const cutoff = new Date(
						now.getTime() + lookaheadDays * 24 * 60 * 60 * 1000,
					);
					const expiringItems = await d1
						.select()
						.from(cargo)
						.where(
							and(
								eq(cargo.organizationId, ctx.organizationId),
								isNotNull(cargo.expiresAt),
								gte(cargo.expiresAt, now),
								lte(cargo.expiresAt, cutoff),
							),
						)
						.orderBy(cargo.expiresAt);
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

	// ─── Inventory Write Tools ───────────────────────────────────────────────

	server.tool(
		"add_cargo_item",
		"Add a new item to the pantry inventory. Skips AI vector embedding (no credits charged). Vectors are backfilled asynchronously.",
		{
			name: z.string().min(1),
			quantity: z.number().positive(),
			unit: z.string(),
			domain: z
				.enum(["food", "household", "alcohol"])
				.optional()
				.default("food"),
			tags: z.array(z.string()).optional().default([]),
			expiresAt: z.string().optional(),
		},
		async (args: {
			name: string;
			quantity: number;
			unit: string;
			domain?: "food" | "household" | "alcohol";
			tags?: string[];
			expiresAt?: string;
		}) =>
			makeTool({
				name: "add_cargo_item",
				scopes: ["mcp:inventory:write"],
				rateLimitCategory: "mcp_write",
				audit: true,
				handler: async (ctx, a: typeof args) => {
					const unit = toSupportedUnit(a.unit);
					const results = await ingestCargoItems(
						env,
						ctx.organizationId,
						[
							{
								name: a.name,
								quantity: a.quantity,
								unit,
								domain: a.domain ?? "food",
								tags: a.tags ?? [],
								expiresAt: a.expiresAt ? new Date(a.expiresAt) : undefined,
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
			})(env, args),
	);

	server.tool(
		"update_cargo_item",
		"Update a pantry item's name, quantity, unit, expiry, domain, or tags. Vectors are re-upserted asynchronously when name changes.",
		{
			itemId: z.string().uuid(),
			name: z.string().min(1).optional(),
			quantity: z.number().positive().optional(),
			unit: z.string().optional(),
			domain: z.enum(["food", "household", "alcohol"]).optional(),
			tags: z.array(z.string()).optional(),
			expiresAt: z.string().optional(),
		},
		async (args: {
			itemId: string;
			name?: string;
			quantity?: number;
			unit?: string;
			domain?: "food" | "household" | "alcohol";
			tags?: string[];
			expiresAt?: string;
		}) =>
			makeTool({
				name: "update_cargo_item",
				scopes: ["mcp:inventory:write"],
				rateLimitCategory: "mcp_write",
				audit: true,
				handler: async (ctx, a: typeof args) => {
					const unit = a.unit ? toSupportedUnit(a.unit) : undefined;
					const updated = await updateItem(env, ctx.organizationId, a.itemId, {
						name: a.name,
						quantity: a.quantity,
						unit,
						domain: a.domain,
						tags: a.tags,
						expiresAt: a.expiresAt ? new Date(a.expiresAt) : undefined,
					});
					if (!updated) {
						return err(
							"update_cargo_item",
							"not_found",
							`Cargo item ${a.itemId} not found.`,
						);
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
			})(env, args),
	);

	server.tool(
		"remove_cargo_item",
		"Remove an item from the pantry inventory. Destructive — pass confirm:true. Use itemId from list_inventory or search_ingredients.",
		{
			itemId: z.string().uuid(),
			confirm: z.boolean().describe("Set true to confirm permanent removal."),
		},
		async (args: { itemId: string; confirm: boolean }) =>
			makeTool({
				name: "remove_cargo_item",
				scopes: ["mcp:inventory:write"],
				rateLimitCategory: "mcp_write",
				audit: true,
				handler: async (ctx, a: typeof args) => {
					if (!a.confirm) {
						return err(
							"remove_cargo_item",
							"invalid_input",
							"Pass confirm:true to permanently remove this cargo item.",
						);
					}
					await jettisonItem(env, ctx.organizationId, a.itemId);
					return ok("remove_cargo_item", { removed: true, itemId: a.itemId });
				},
			})(env, args),
	);

	// ─── Inventory Import (Receipt → Pantry) ─────────────────────────────────

	server.tool(
		"inventory_import_schema",
		"Return the JSON schema (item shape, allowed units, max rows) for preview_inventory_import / apply_inventory_import. Call before constructing items so the LLM can match field names exactly.",
		{},
		async () =>
			makeTool({
				name: "inventory_import_schema",
				scopes: ["mcp:read"],
				rateLimitCategory: "mcp_list",
				audit: false,
				handler: async () =>
					ok("inventory_import_schema", getInventoryImportSchema()),
			})(env, {}),
	);

	server.tool(
		"preview_inventory_import",
		"Dry-run a bulk inventory import (e.g. from a parsed receipt). Returns a previewToken plus per-row create/merge/error classification. No DB writes happen here. Pass the previewToken to apply_inventory_import within 15 minutes.",
		{
			items: z
				.array(
					z.object({
						id: z.string().uuid().optional(),
						name: z.string().min(1),
						quantity: z.number().positive(),
						unit: z.string(),
						domain: z
							.enum(["food", "household", "alcohol"])
							.optional()
							.default("food"),
						tags: z.array(z.string()).optional().default([]),
						expiresAt: z.string().optional(),
					}),
				)
				.min(1)
				.max(500),
		},
		async (args: { items: InventoryImportItem[] }) =>
			makeTool({
				name: "preview_inventory_import",
				scopes: ["mcp:inventory:write"],
				rateLimitCategory: "mcp_write",
				audit: true,
				handler: async (ctx, a: typeof args) => {
					const result = await previewInventoryImport(
						env,
						ctx.organizationId,
						a.items,
					);
					return ok("preview_inventory_import", result);
				},
			})(env, args),
	);

	server.tool(
		"apply_inventory_import",
		"Commit a previously-previewed inventory import. Pass the previewToken from preview_inventory_import. Idempotent: replaying the same idempotencyKey within 24h returns the original outcome with meta.replayed:true.",
		{
			previewToken: z.string().min(8),
			idempotencyKey: z.string().min(8).max(128),
		},
		async (args: { previewToken: string; idempotencyKey: string }) =>
			makeTool({
				name: "apply_inventory_import",
				scopes: ["mcp:inventory:write"],
				rateLimitCategory: "mcp_write",
				audit: true,
				handler: async (ctx, a: typeof args) => {
					const result = await applyInventoryImport(env, ctx.organizationId, {
						previewToken: a.previewToken,
						idempotencyKey: a.idempotencyKey,
						apiKeyId: ctx.apiKeyId,
					});
					return ok("apply_inventory_import", result, {
						meta: result.replayed ? { replayed: true } : undefined,
					});
				},
			})(env, args),
	);

	server.tool(
		"import_inventory_csv",
		"Import inventory from a raw CSV string (max 1 MB). Convenience wrapper that parses the CSV and applies the result in one call. For large or untrusted inputs, prefer preview_inventory_import + apply_inventory_import.",
		{
			csv: z
				.string()
				.min(1)
				.max(1024 * 1024),
			idempotencyKey: z.string().min(8).max(128),
		},
		async (args: { csv: string; idempotencyKey: string }) =>
			makeTool({
				name: "import_inventory_csv",
				scopes: ["mcp:inventory:write"],
				rateLimitCategory: "mcp_write",
				audit: true,
				handler: async (ctx, a: typeof args) => {
					const result = await importInventoryCsv(env, ctx.organizationId, {
						csv: a.csv,
						idempotencyKey: a.idempotencyKey,
						apiKeyId: ctx.apiKeyId,
					});
					return ok("import_inventory_csv", result, {
						meta: result.replayed ? { replayed: true } : undefined,
						warnings:
							result.warnings && result.warnings.length > 0
								? result.warnings
								: undefined,
					});
				},
			})(env, args),
	);

	// ─── Galley (Recipes) Write Tools ────────────────────────────────────────

	server.tool(
		"create_meal",
		"Create a new recipe in the Galley. For bulk import use REST POST /api/v1/galley/import (galley scope). AI generation stays in the Ration UI.",
		{
			meal: McpCreateMealSchema,
		},
		async (args: { meal: z.infer<typeof McpCreateMealSchema> }) =>
			makeTool({
				name: "create_meal",
				scopes: ["mcp:galley:write"],
				rateLimitCategory: "mcp_write",
				audit: true,
				handler: async (ctx, a: typeof args) => {
					const parsed = McpCreateMealSchema.parse(a.meal);
					const created = await createMeal(
						env.DB,
						ctx.organizationId,
						parsed,
						env,
					);
					return ok("create_meal", {
						id: created?.id,
						name: created?.name,
						servings: created?.servings,
						ingredientCount: created?.ingredients.length ?? 0,
						tags: created?.tags ?? [],
					});
				},
			})(env, args),
	);

	server.tool(
		"update_meal",
		"Update a recipe in the Galley. Round-trip: list_meals → modify → pass complete object including id.",
		{
			meal: MealUpdateSchema,
		},
		async (args: { meal: z.infer<typeof MealUpdateSchema> }) =>
			makeTool({
				name: "update_meal",
				scopes: ["mcp:galley:write"],
				rateLimitCategory: "mcp_write",
				audit: true,
				handler: async (ctx, a: typeof args) => {
					const parsed = MealUpdateSchema.parse(a.meal);
					const { id, ...mealInput } = parsed;
					const updated = await updateMeal(
						env.DB,
						ctx.organizationId,
						id,
						mealInput,
					);
					if (!updated) {
						return err("update_meal", "not_found", "Meal not found.");
					}
					return ok("update_meal", {
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
					});
				},
			})(env, args),
	);

	server.tool(
		"delete_meal",
		"Delete a recipe from the Galley. Destructive — pass confirm:true. Cascades to ingredients/tags but does not delete plan entries.",
		{
			mealId: z.string().uuid(),
			confirm: z.boolean(),
		},
		async (args: { mealId: string; confirm: boolean }) =>
			makeTool({
				name: "delete_meal",
				scopes: ["mcp:galley:write"],
				rateLimitCategory: "mcp_write",
				audit: true,
				handler: async (ctx, a: typeof args) => {
					if (!a.confirm) {
						return err(
							"delete_meal",
							"invalid_input",
							"Pass confirm:true to permanently delete this meal.",
						);
					}
					await deleteMeal(env.DB, ctx.organizationId, a.mealId);
					return ok("delete_meal", { deleted: true, mealId: a.mealId });
				},
			})(env, args),
	);

	server.tool(
		"toggle_meal_active",
		"Toggle a meal's selection in the Galley active list. The active list drives sync_supply_from_selected_meals. Pass servingsOverride to set/clear the per-selection servings count.",
		{
			mealId: z.string().uuid(),
			active: z.boolean(),
			servingsOverride: z.number().int().positive().nullable().optional(),
		},
		async (args: {
			mealId: string;
			active: boolean;
			servingsOverride?: number | null;
		}) =>
			makeTool({
				name: "toggle_meal_active",
				scopes: ["mcp:galley:write"],
				rateLimitCategory: "mcp_write",
				audit: true,
				handler: async (ctx, a: typeof args) => {
					const owns = await validateMealOwnership(
						env.DB,
						ctx.organizationId,
						a.mealId,
					);
					if (!owns) {
						return err(
							"toggle_meal_active",
							"not_found",
							`Meal ${a.mealId} not found.`,
						);
					}
					if (a.active) {
						const result = await upsertMealSelection(
							env.DB,
							ctx.organizationId,
							a.mealId,
							a.servingsOverride ?? null,
						);
						return ok("toggle_meal_active", {
							mealId: a.mealId,
							isActive: result.isActive,
							servingsOverride: result.servingsOverride,
						});
					}
					// Clear by toggling: read current, delete if exists.
					const selections = await getActiveMealSelections(
						env.DB,
						ctx.organizationId,
					);
					const existing = selections.find((s) => s.mealId === a.mealId);
					if (!existing) {
						return ok("toggle_meal_active", {
							mealId: a.mealId,
							isActive: false,
						});
					}
					const d1 = drizzle(env.DB);
					await d1
						.delete((await import("../../db/schema")).activeMealSelection)
						.where(
							eq(
								(await import("../../db/schema")).activeMealSelection.id,
								existing.id,
							),
						);
					return ok("toggle_meal_active", {
						mealId: a.mealId,
						isActive: false,
					});
				},
			})(env, args),
	);

	server.tool(
		"clear_active_meals",
		"Clear all active meal selections in the Galley. Destructive — pass confirm:true.",
		{ confirm: z.boolean() },
		async (args: { confirm: boolean }) =>
			makeTool({
				name: "clear_active_meals",
				scopes: ["mcp:galley:write"],
				rateLimitCategory: "mcp_write",
				audit: true,
				handler: async (ctx, a: typeof args) => {
					if (!a.confirm) {
						return err(
							"clear_active_meals",
							"invalid_input",
							"Pass confirm:true to clear all active meal selections.",
						);
					}
					const result = await clearMealSelections(env.DB, ctx.organizationId);
					return ok("clear_active_meals", result);
				},
			})(env, args),
	);

	server.tool(
		"consume_meal",
		"Mark a meal as cooked and deduct ingredients from the pantry. Use after the user reports cooking/eating a meal.",
		{
			mealId: z.string().uuid(),
			servings: z.number().int().positive().optional(),
		},
		async (args: { mealId: string; servings?: number }) =>
			makeTool({
				name: "consume_meal",
				scopes: ["mcp:galley:write", "mcp:inventory:write"],
				rateLimitCategory: "mcp_write",
				audit: true,
				handler: async (ctx, a: typeof args) => {
					await cookMeal(env, ctx.organizationId, a.mealId, {
						servings: a.servings,
					});
					return ok("consume_meal", {
						consumed: true,
						mealId: a.mealId,
						servings: a.servings ?? "default",
						note: "Ingredients have been deducted from your pantry inventory.",
					});
				},
			})(env, args),
	);

	// ─── Manifest (Meal Plan) Write Tools ────────────────────────────────────

	server.tool(
		"add_meal_plan_entry",
		"Add a meal to the weekly meal plan for a specific date and slot.",
		{
			mealId: z.string().uuid(),
			date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
			slotType: z.enum(["breakfast", "lunch", "dinner", "snack"]),
			servingsOverride: z.number().int().positive().optional(),
			notes: z.string().max(500).optional(),
		},
		async (args: {
			mealId: string;
			date: string;
			slotType: "breakfast" | "lunch" | "dinner" | "snack";
			servingsOverride?: number;
			notes?: string;
		}) =>
			makeTool({
				name: "add_meal_plan_entry",
				scopes: ["mcp:manifest:write"],
				rateLimitCategory: "mcp_write",
				audit: true,
				handler: async (ctx, a: typeof args) => {
					const plan = await ensureMealPlan(env.DB, ctx.organizationId);
					const entry = await addEntry(env.DB, ctx.organizationId, plan.id, {
						mealId: a.mealId,
						date: a.date,
						slotType: a.slotType,
						servingsOverride: a.servingsOverride ?? null,
						notes: a.notes ?? null,
					});
					return ok("add_meal_plan_entry", {
						entryId: entry.id,
						mealName: entry.mealName,
						date: entry.date,
						slotType: entry.slotType,
						servings: entry.servingsOverride ?? entry.mealServings,
					});
				},
			})(env, args),
	);

	server.tool(
		"bulk_add_meal_plan_entries",
		"Add multiple meal plan entries in one call (max 50). All-or-nothing: validation runs first, then entries are batched.",
		{
			entries: z
				.array(
					z.object({
						mealId: z.string().uuid(),
						date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
						slotType: z.enum(["breakfast", "lunch", "dinner", "snack"]),
						servingsOverride: z.number().int().positive().nullable().optional(),
						notes: z.string().max(500).nullable().optional(),
					}),
				)
				.min(1)
				.max(50),
		},
		async (args: {
			entries: Array<{
				mealId: string;
				date: string;
				slotType: "breakfast" | "lunch" | "dinner" | "snack";
				servingsOverride?: number | null;
				notes?: string | null;
			}>;
		}) =>
			makeTool({
				name: "bulk_add_meal_plan_entries",
				scopes: ["mcp:manifest:write"],
				rateLimitCategory: "mcp_write",
				audit: true,
				handler: async (ctx, a: typeof args) => {
					const plan = await ensureMealPlan(env.DB, ctx.organizationId);
					const created: Array<{
						entryId: string;
						mealId: string;
						date: string;
						slotType: string;
					}> = [];
					const errors: Array<{ index: number; error: string }> = [];
					// addEntry validates ownership per row; we serialize to surface row-level errors.
					for (let i = 0; i < a.entries.length; i++) {
						const e = a.entries[i];
						if (!e) continue;
						try {
							const entry = await addEntry(
								env.DB,
								ctx.organizationId,
								plan.id,
								{
									mealId: e.mealId,
									date: e.date,
									slotType: e.slotType,
									servingsOverride: e.servingsOverride ?? null,
									notes: e.notes ?? null,
								},
							);
							created.push({
								entryId: entry.id,
								mealId: entry.mealId,
								date: entry.date,
								slotType: entry.slotType,
							});
						} catch (err2) {
							errors.push({
								index: i,
								error: err2 instanceof Error ? err2.message : String(err2),
							});
						}
					}
					return ok("bulk_add_meal_plan_entries", {
						created,
						errorCount: errors.length,
						errors: errors.length > 0 ? errors : undefined,
					});
				},
			})(env, args),
	);

	server.tool(
		"update_meal_plan_entry",
		"Update an existing meal plan entry (date, slot, servings, notes). Cannot change consumed entries.",
		{
			entryId: z.string().uuid(),
			date: z
				.string()
				.regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD")
				.optional(),
			slotType: z.enum(["breakfast", "lunch", "dinner", "snack"]).optional(),
			servingsOverride: z.number().int().positive().optional(),
			clearServingsOverride: z.boolean().optional(),
			notes: z.string().max(500).optional(),
			orderIndex: z.number().int().nonnegative().optional(),
		},
		async (args: {
			entryId: string;
			date?: string;
			slotType?: "breakfast" | "lunch" | "dinner" | "snack";
			servingsOverride?: number;
			clearServingsOverride?: boolean;
			notes?: string;
			orderIndex?: number;
		}) =>
			makeTool({
				name: "update_meal_plan_entry",
				scopes: ["mcp:manifest:write"],
				rateLimitCategory: "mcp_write",
				audit: true,
				handler: async (ctx, a: typeof args) => {
					const hasPatch =
						a.date !== undefined ||
						a.slotType !== undefined ||
						a.servingsOverride !== undefined ||
						a.clearServingsOverride === true ||
						a.notes !== undefined ||
						a.orderIndex !== undefined;
					if (!hasPatch) {
						return err(
							"update_meal_plan_entry",
							"invalid_input",
							"Provide at least one of: date, slotType, servingsOverride, clearServingsOverride, notes, orderIndex.",
						);
					}
					const plan = await ensureMealPlan(env.DB, ctx.organizationId);
					const d1 = drizzle(env.DB);
					const [existing] = await d1
						.select({ consumedAt: mealPlanEntry.consumedAt })
						.from(mealPlanEntry)
						.where(
							and(
								eq(mealPlanEntry.id, a.entryId),
								eq(mealPlanEntry.planId, plan.id),
							),
						)
						.limit(1);
					if (!existing) {
						return err(
							"update_meal_plan_entry",
							"not_found",
							"Entry not found on your active meal plan.",
						);
					}
					if (existing.consumedAt != null) {
						return err(
							"update_meal_plan_entry",
							"conflict",
							"This entry is already marked consumed; remove it or edit unconsumed entries only.",
						);
					}
					const input: {
						date?: string;
						slotType?: string;
						orderIndex?: number;
						servingsOverride?: number | null;
						notes?: string | null;
					} = {};
					if (a.date !== undefined) input.date = a.date;
					if (a.slotType !== undefined) input.slotType = a.slotType;
					if (a.orderIndex !== undefined) input.orderIndex = a.orderIndex;
					if (a.clearServingsOverride === true) {
						input.servingsOverride = null;
					} else if (a.servingsOverride !== undefined) {
						input.servingsOverride = a.servingsOverride;
					}
					if (a.notes !== undefined) input.notes = a.notes;
					const updated = await updateEntry(
						env.DB,
						ctx.organizationId,
						plan.id,
						a.entryId,
						input,
					);
					if (!updated) {
						return err(
							"update_meal_plan_entry",
							"internal_error",
							"Update failed.",
						);
					}
					return ok("update_meal_plan_entry", {
						entryId: updated.id,
						date: updated.date,
						slotType: updated.slotType,
						mealName: updated.mealName,
						servings: updated.servingsOverride ?? updated.mealServings,
						notes: updated.notes,
						orderIndex: updated.orderIndex,
					});
				},
			})(env, args),
	);

	server.tool(
		"remove_meal_plan_entry",
		"Remove a meal from the weekly plan.",
		{ entryId: z.string().uuid() },
		async (args: { entryId: string }) =>
			makeTool({
				name: "remove_meal_plan_entry",
				scopes: ["mcp:manifest:write"],
				rateLimitCategory: "mcp_write",
				audit: true,
				handler: async (ctx, a: typeof args) => {
					const plan = await ensureMealPlan(env.DB, ctx.organizationId);
					const removed = await deleteEntry(
						env.DB,
						ctx.organizationId,
						plan.id,
						a.entryId,
					);
					if (!removed) {
						return err(
							"remove_meal_plan_entry",
							"not_found",
							"Entry not found on your active meal plan.",
						);
					}
					return ok("remove_meal_plan_entry", {
						removed: true,
						entryId: a.entryId,
					});
				},
			})(env, args),
	);

	// ─── Supply Write Tools ──────────────────────────────────────────────────

	server.tool(
		"add_supply_item",
		"Add an item to the active supply/shopping list.",
		{
			name: z.string().min(1),
			quantity: z.number().positive().optional(),
			unit: z.string().optional(),
			domain: z
				.enum(["food", "household", "alcohol"])
				.optional()
				.default("food"),
		},
		async (args: {
			name: string;
			quantity?: number;
			unit?: string;
			domain?: "food" | "household" | "alcohol";
		}) =>
			makeTool({
				name: "add_supply_item",
				scopes: ["mcp:supply:write"],
				rateLimitCategory: "mcp_write",
				audit: true,
				handler: async (ctx, a: typeof args) => {
					const list = await ensureSupplyList(env.DB, ctx.organizationId);
					if (!list) {
						return err(
							"add_supply_item",
							"internal_error",
							"Could not locate or create supply list.",
						);
					}
					const item = await addSupplyItem(
						env.DB,
						ctx.organizationId,
						list.id,
						{
							name: a.name,
							quantity: a.quantity,
							unit: a.unit,
							domain: a.domain ?? "food",
						},
					);
					return ok("add_supply_item", {
						id: item.id,
						name: item.name,
						quantity: item.quantity,
						unit: item.unit,
					});
				},
			})(env, args),
	);

	server.tool(
		"update_supply_item",
		"Update an existing supply list item.",
		{
			itemId: z.string().uuid(),
			name: z.string().min(1).optional(),
			quantity: z.number().positive().optional(),
			unit: z.string().optional(),
		},
		async (args: {
			itemId: string;
			name?: string;
			quantity?: number;
			unit?: string;
		}) =>
			makeTool({
				name: "update_supply_item",
				scopes: ["mcp:supply:write"],
				rateLimitCategory: "mcp_write",
				audit: true,
				handler: async (ctx, a: typeof args) => {
					const list = await ensureSupplyList(env.DB, ctx.organizationId);
					if (!list) {
						return err(
							"update_supply_item",
							"internal_error",
							"Could not locate or create supply list.",
						);
					}
					const item = await updateSupplyItem(
						env.DB,
						ctx.organizationId,
						list.id,
						a.itemId,
						{ name: a.name, quantity: a.quantity, unit: a.unit },
					);
					if (!item) {
						return err(
							"update_supply_item",
							"not_found",
							`Item ${a.itemId} not found on supply list.`,
						);
					}
					return ok("update_supply_item", {
						id: item.id,
						name: item.name,
						quantity: item.quantity,
						unit: item.unit,
					});
				},
			})(env, args),
	);

	server.tool(
		"remove_supply_item",
		"Remove an item from the supply list.",
		{ itemId: z.string().uuid() },
		async (args: { itemId: string }) =>
			makeTool({
				name: "remove_supply_item",
				scopes: ["mcp:supply:write"],
				rateLimitCategory: "mcp_write",
				audit: true,
				handler: async (ctx, a: typeof args) => {
					const list = await ensureSupplyList(env.DB, ctx.organizationId);
					if (!list) {
						return err(
							"remove_supply_item",
							"internal_error",
							"Could not locate or create supply list.",
						);
					}
					await deleteSupplyItem(env.DB, ctx.organizationId, list.id, a.itemId);
					return ok("remove_supply_item", { removed: true, itemId: a.itemId });
				},
			})(env, args),
	);

	server.tool(
		"mark_supply_purchased",
		"Mark a supply list item as purchased or unpurchased.",
		{
			itemId: z.string().uuid(),
			purchased: z.boolean(),
		},
		async (args: { itemId: string; purchased: boolean }) =>
			makeTool({
				name: "mark_supply_purchased",
				scopes: ["mcp:supply:write"],
				rateLimitCategory: "mcp_write",
				audit: true,
				handler: async (ctx, a: typeof args) => {
					const list = await ensureSupplyList(env.DB, ctx.organizationId);
					if (!list) {
						return err(
							"mark_supply_purchased",
							"internal_error",
							"Could not locate or create supply list.",
						);
					}
					const item = await updateSupplyItem(
						env.DB,
						ctx.organizationId,
						list.id,
						a.itemId,
						{ isPurchased: a.purchased },
					);
					if (!item) {
						return err(
							"mark_supply_purchased",
							"not_found",
							`Item ${a.itemId} not found on supply list.`,
						);
					}
					return ok("mark_supply_purchased", {
						itemId: item.id,
						name: item.name,
						isPurchased: item.isPurchased,
					});
				},
			})(env, args),
	);

	server.tool(
		"sync_supply_from_selected_meals",
		"Rebuild the shopping list from this week's meal plan + Galley active selections (same as Supply → Update list). Uses semantic matching vs pantry; may call Vectorize. Rate-limited separately from regular writes.",
		{
			unitMode: z.enum(["metric", "imperial"]).optional(),
		},
		async (args: { unitMode?: "metric" | "imperial" }) =>
			makeTool({
				name: "sync_supply_from_selected_meals",
				scopes: ["mcp:supply:write"],
				rateLimitCategory: "mcp_supply_sync",
				audit: true,
				handler: async (ctx, a: typeof args) => {
					const result = await createSupplyListFromSelectedMeals(
						env,
						ctx.organizationId,
						undefined,
						{ trigger: "mcp_sync_supply", organizationId: ctx.organizationId },
						a.unitMode ?? "metric",
					);
					const list = result.list;
					if (!list) {
						return err(
							"sync_supply_from_selected_meals",
							"internal_error",
							"Supply sync did not return a list.",
						);
					}
					const fullList = await getSupplyListById(
						env.DB,
						ctx.organizationId,
						list.id,
					);
					return ok("sync_supply_from_selected_meals", {
						listId: list.id,
						summary: result.summary,
						itemCount: fullList?.items.length ?? 0,
					});
				},
			})(env, args),
	);

	server.tool(
		"complete_supply_list",
		"Dock all purchased items from the active supply list into pantry inventory and remove them from the list. Destructive — pass confirm:true.",
		{ confirm: z.boolean() },
		async (args: { confirm: boolean }) =>
			makeTool({
				name: "complete_supply_list",
				scopes: ["mcp:supply:write", "mcp:inventory:write"],
				rateLimitCategory: "mcp_write",
				audit: true,
				handler: async (ctx, a: typeof args) => {
					if (!a.confirm) {
						return err(
							"complete_supply_list",
							"invalid_input",
							"Pass confirm:true to dock purchased items into the pantry.",
						);
					}
					const list = await ensureSupplyList(env.DB, ctx.organizationId);
					if (!list) {
						return err(
							"complete_supply_list",
							"internal_error",
							"Could not locate supply list.",
						);
					}
					const result = await completeSupplyList(
						env,
						ctx.organizationId,
						list.id,
					);
					return ok("complete_supply_list", result);
				},
			})(env, args),
	);

	// ─── User Preferences ────────────────────────────────────────────────────

	server.tool(
		"get_user_preferences",
		"Return the calling user's allergens, expirationAlertDays, theme, manifest defaults, and other settings stored in user.settings.",
		{},
		async () =>
			makeTool({
				name: "get_user_preferences",
				scopes: ["mcp:read"],
				rateLimitCategory: "mcp_list",
				audit: false,
				handler: async (ctx) => {
					const settings = await getUserSettings(env.DB, ctx.userId);
					return ok("get_user_preferences", settings);
				},
			})(env, {}),
	);

	server.tool(
		"update_user_preferences",
		"Patch the calling user's settings (allergens, expirationAlertDays, theme, manifestSettings). Only provided fields are updated.",
		{
			allergens: z.array(z.string()).optional(),
			expirationAlertDays: z.number().int().min(0).max(365).optional(),
			theme: z.enum(["light", "dark"]).optional(),
		},
		async (args: {
			allergens?: string[];
			expirationAlertDays?: number;
			theme?: "light" | "dark";
		}) =>
			makeTool({
				name: "update_user_preferences",
				scopes: ["mcp:preferences:write"],
				rateLimitCategory: "mcp_write",
				audit: true,
				handler: async (ctx, a: typeof args) => {
					// We trust types but cast allergens for compatibility with AllergenSlug.
					const patch: Record<string, unknown> = {};
					if (a.allergens !== undefined) patch.allergens = a.allergens;
					if (a.expirationAlertDays !== undefined)
						patch.expirationAlertDays = a.expirationAlertDays;
					if (a.theme !== undefined) patch.theme = a.theme;
					if (Object.keys(patch).length === 0) {
						return err(
							"update_user_preferences",
							"invalid_input",
							"Provide at least one of: allergens, expirationAlertDays, theme.",
						);
					}
					await patchUserSettings(env.DB, ctx.userId, patch as never);
					const settings = await getUserSettings(env.DB, ctx.userId);
					return ok("update_user_preferences", settings);
				},
			})(env, args),
	);
}
