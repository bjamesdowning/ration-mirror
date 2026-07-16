import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
	getCargoByIds,
	getCargoItem,
	ingestCargoItems,
	jettisonItem,
	updateItem,
} from "../../cargo.server";
import {
	applyInventoryImport,
	getInventoryImportSchema,
	importInventoryCsv,
	previewInventoryImport,
} from "../../inventory-import.server";
import { toSupportedUnit } from "../../units";
import { findSimilarCargoBatch } from "../../vector.server";
import { err, ok, type ToolEnvelope } from "../envelope";
import {
	defineSharedTool,
	type McpToolsEnv,
	registerSharedMcpTool,
} from "../tool-runtime";

const CARGO_QTY_MIN0 = z
	.number()
	.min(
		0,
		"Quantity cannot be negative. 0 means out of stock; the item stays in Cargo as a restock reminder. Use remove_cargo_item to delete.",
	);

/** Min score gap between #1 and #2 to auto-pick a name match without asking. */
const ADJUST_NAME_SCORE_GAP = 0.1;

type AdjustCargoItemData = {
	adjusted: boolean;
	requiresDisambiguation?: boolean;
	candidates?: Array<{
		id: string;
		name: string;
		quantity: number;
		unit: string;
		matchScore: number;
	}>;
	note?: string;
	id?: string;
	name?: string;
	quantity?: number;
	unit?: string;
	previousQuantity?: number;
	deltaRequested?: number;
	deltaApplied?: number;
};

export function createInventoryToolDefs(env: McpToolsEnv) {
	return [
		defineSharedTool({
			name: "add_cargo_item",
			description:
				"Add a single pantry item. Skips fuzzy Vectorize merge (no Ration credits). Exact-name merge still applies. For 2+ items or a receipt/list, use inventory_import_schema → preview_inventory_import → apply_inventory_import instead. Quantity must be greater than 0.",
			inputSchema: z.object({
				name: z.string().min(1),
				quantity: z
					.number()
					.positive("Quantity must be greater than 0 when adding stock."),
				unit: z.string().min(1),
				domain: z
					.enum(["food", "household", "alcohol"])
					.optional()
					.default("food"),
				tags: z.array(z.string()).optional().default([]),
				expiresAt: z.string().optional(),
			}),
			scopes: ["mcp:inventory:write"],
			rateLimitCategory: "mcp_write",
			audit: true,
			handler: async (ctx, a) => {
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
						{
							recoveryHint:
								"Call get_billing_summary for upgrade options, or remove_cargo_item to free capacity.",
						},
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
		}),
		defineSharedTool({
			name: "update_cargo_item",
			description:
				"Set absolute fields on a pantry item (name, quantity, unit, expiry, domain, tags). Quantity may be 0 (out of stock; item remains as a restock reminder). Use remove_cargo_item only when the user wants the line deleted. For relative changes like 'ate 2', prefer adjust_cargo_item.",
			inputSchema: z.object({
				itemId: z.string().uuid(),
				name: z.string().min(1).optional(),
				quantity: CARGO_QTY_MIN0.optional(),
				unit: z.string().optional(),
				domain: z.enum(["food", "household", "alcohol"]).optional(),
				tags: z.array(z.string()).optional(),
				expiresAt: z.string().optional(),
			}),
			scopes: ["mcp:inventory:write"],
			rateLimitCategory: "mcp_write",
			audit: true,
			handler: async (ctx, a) => {
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
						{
							recoveryHint:
								"Call search_ingredients or list_inventory to find a valid itemId.",
						},
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
		}),
		defineSharedTool({
			name: "adjust_cargo_item",
			description:
				"Change pantry quantity by a relative delta (e.g. delta:-2 when the user ate 2). Floors at 0; the item stays in Cargo. Prefer over update_cargo_item for 'I used/ate N'. Provide itemId, or name to resolve via semantic search. For absolute set (including 0), use update_cargo_item. For bulk add, use preview_inventory_import.",
			inputSchema: z.object({
				itemId: z.string().uuid().optional(),
				name: z
					.string()
					.min(1)
					.optional()
					.describe(
						"Used when itemId is unknown; resolved via semantic search.",
					),
				delta: z
					.number()
					.refine((d) => d !== 0, { message: "delta must be non-zero" })
					.describe(
						"Relative change; negative to consume, positive to add stock.",
					),
				unit: z.string().optional(),
			}),
			scopes: ["mcp:inventory:write"],
			rateLimitCategory: "mcp_write",
			audit: true,
			handler: async (ctx, a): Promise<ToolEnvelope<AdjustCargoItemData>> => {
				if (!a.itemId && !a.name) {
					return err(
						"adjust_cargo_item",
						"invalid_input",
						"Provide itemId or name.",
						{
							recoveryHint:
								"Call search_ingredients or list_inventory, then retry with itemId.",
						},
					);
				}

				let itemId = a.itemId;
				if (!itemId && a.name) {
					const results = await findSimilarCargoBatch(
						env,
						ctx.organizationId,
						[a.name],
						{ topK: 3, threshold: 0.6 },
					);
					const matches = results.get(a.name) ?? [];
					if (matches.length === 0) {
						return err(
							"adjust_cargo_item",
							"not_found",
							`No pantry item matched "${a.name}".`,
							{
								recoveryHint:
									"Call search_ingredients with a broader query, or list_inventory.",
							},
						);
					}
					const top = matches[0];
					if (!top) {
						return err(
							"adjust_cargo_item",
							"not_found",
							`No pantry item matched "${a.name}".`,
							{
								recoveryHint:
									"Call search_ingredients with a broader query, or list_inventory.",
							},
						);
					}
					const runnerUp = matches[1];
					const ambiguous =
						runnerUp != null &&
						top.score - runnerUp.score < ADJUST_NAME_SCORE_GAP;
					if (ambiguous) {
						const rows = await getCargoByIds(
							env.DB,
							ctx.organizationId,
							matches.map((m) => m.itemId),
						);
						const scoreById = new Map(
							matches.map((m) => [m.itemId, m.score] as const),
						);
						return ok("adjust_cargo_item", {
							adjusted: false,
							requiresDisambiguation: true,
							candidates: rows.map((row) => ({
								id: row.id,
								name: row.name,
								quantity: row.quantity,
								unit: row.unit,
								matchScore: scoreById.get(row.id) ?? 0,
							})),
							note: `Multiple pantry items matched "${a.name}". Ask which one, then retry adjust_cargo_item with that itemId.`,
						});
					}
					itemId = top.itemId;
				}
				if (!itemId) {
					return err(
						"adjust_cargo_item",
						"not_found",
						"Could not resolve cargo item.",
						{
							recoveryHint:
								"Call search_ingredients or list_inventory for a valid itemId.",
						},
					);
				}

				const existing = await getCargoItem(env.DB, ctx.organizationId, itemId);
				if (!existing) {
					return err(
						"adjust_cargo_item",
						"not_found",
						`Cargo item ${itemId} not found.`,
						{
							recoveryHint:
								"Call search_ingredients or list_inventory to find a valid itemId.",
						},
					);
				}

				const previousQuantity = existing.quantity;
				let nextQuantity = previousQuantity + a.delta;
				const warnings: string[] = [];
				if (nextQuantity < 0) {
					warnings.push(
						`Requested delta ${a.delta} would go below 0 (had ${previousQuantity}). Clamped to 0; item kept as a restock reminder.`,
					);
					nextQuantity = 0;
				}

				const unit = a.unit ? toSupportedUnit(a.unit) : undefined;
				const updated = await updateItem(env, ctx.organizationId, itemId, {
					quantity: nextQuantity,
					unit,
				});
				if (!updated) {
					return err(
						"adjust_cargo_item",
						"not_found",
						`Cargo item ${itemId} not found.`,
						{
							recoveryHint:
								"Call search_ingredients or list_inventory to find a valid itemId.",
						},
					);
				}

				const deltaApplied = nextQuantity - previousQuantity;
				return ok(
					"adjust_cargo_item",
					{
						adjusted: true,
						id: updated.id,
						name: updated.name,
						quantity: updated.quantity,
						unit: updated.unit,
						previousQuantity,
						deltaRequested: a.delta,
						deltaApplied,
					},
					warnings.length > 0 ? { warnings } : undefined,
				);
			},
		}),
		defineSharedTool({
			name: "remove_cargo_item",
			description:
				"Permanently delete a pantry line. Destructive — pass confirm:true. Prefer update_cargo_item or adjust_cargo_item to quantity 0 when the user still wants a restock reminder. Use itemId from list_inventory or search_ingredients.",
			inputSchema: z.object({
				itemId: z.string().uuid(),
				confirm: z.boolean().describe("Set true to confirm permanent removal."),
			}),
			scopes: ["mcp:inventory:write"],
			rateLimitCategory: "mcp_write",
			audit: true,
			needsApproval: true,
			handler: async (ctx, a) => {
				if (!a.confirm) {
					return err(
						"remove_cargo_item",
						"invalid_input",
						"Pass confirm:true to permanently remove this cargo item.",
						{
							recoveryHint:
								"Retry with confirm:true after the user explicitly agrees to delete, or use update_cargo_item with quantity:0 to keep a restock reminder.",
						},
					);
				}
				const existing = await getCargoItem(
					env.DB,
					ctx.organizationId,
					a.itemId,
				);
				if (!existing) {
					return err(
						"remove_cargo_item",
						"not_found",
						`Cargo item ${a.itemId} not found.`,
						{
							recoveryHint:
								"Call search_ingredients or list_inventory to find a valid itemId.",
						},
					);
				}
				await jettisonItem(env, ctx.organizationId, a.itemId);
				return ok("remove_cargo_item", { removed: true, itemId: a.itemId });
			},
		}),
		defineSharedTool({
			name: "inventory_import_schema",
			description:
				"Return the JSON schema (item shape, allowed units, max rows) for preview_inventory_import / apply_inventory_import. Call before constructing items so the LLM can match field names exactly. Prefer this path for bulk adds (2+ items).",
			inputSchema: z.object({}),
			scopes: ["mcp:read"],
			rateLimitCategory: "mcp_list",
			audit: false,
			handler: async () =>
				ok("inventory_import_schema", getInventoryImportSchema()),
		}),
		defineSharedTool({
			name: "preview_inventory_import",
			description:
				"Dry-run a bulk inventory import (e.g. from a parsed receipt or multi-item list). Returns a previewToken plus per-row create/merge/error classification. No DB writes. Pass the previewToken to apply_inventory_import within 15 minutes. For a single item, prefer add_cargo_item.",
			inputSchema: z.object({
				items: z
					.array(
						z.object({
							id: z.string().uuid().optional(),
							name: z.string().min(1),
							quantity: z
								.number()
								.positive("Each import row quantity must be greater than 0."),
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
			}),
			scopes: ["mcp:inventory:write"],
			rateLimitCategory: "mcp_write",
			audit: true,
			handler: async (ctx, a) => {
				const result = await previewInventoryImport(
					env,
					ctx.organizationId,
					a.items,
				);
				return ok("preview_inventory_import", result);
			},
		}),
		defineSharedTool({
			name: "apply_inventory_import",
			description:
				"Commit a previously-previewed inventory import. Pass the previewToken from preview_inventory_import. Idempotent: replaying the same idempotencyKey within 24h returns the original outcome with meta.replayed:true. If the token expired, call preview_inventory_import again. Skips fuzzy Vectorize merge (exact-name merge only) so bulk apply stays fast and credit-free.",
			inputSchema: z.object({
				previewToken: z
					.string()
					.min(8)
					.describe("Token from preview_inventory_import."),
				idempotencyKey: z
					.string()
					.min(8)
					.max(128)
					.describe("Stable client key (e.g. UUID) for safe retries."),
			}),
			scopes: ["mcp:inventory:write"],
			rateLimitCategory: "mcp_write",
			audit: true,
			needsApproval: true,
			handler: async (ctx, a) => {
				try {
					const result = await applyInventoryImport(env, ctx.organizationId, {
						previewToken: a.previewToken,
						idempotencyKey: a.idempotencyKey,
						apiKeyId: ctx.apiKeyId,
					});
					return ok("apply_inventory_import", result, {
						meta: result.replayed ? { replayed: true } : undefined,
					});
				} catch (e) {
					const message = e instanceof Error ? e.message : String(e);
					if (/preview|token|expired|not found/i.test(message)) {
						return err(
							"apply_inventory_import",
							"invalid_input",
							"Preview token is missing or expired. Call preview_inventory_import again, then retry apply within 15 minutes.",
							{
								recoveryHint:
									"Call preview_inventory_import to get a fresh previewToken, then apply_inventory_import with a new or unused idempotencyKey.",
							},
						);
					}
					throw e;
				}
			},
		}),
		defineSharedTool({
			name: "import_inventory_csv",
			description:
				"Import inventory from a raw CSV string (max 1 MB). Convenience wrapper that parses the CSV and applies the result in one call. For large or untrusted inputs, prefer preview_inventory_import + apply_inventory_import.",
			inputSchema: z.object({
				csv: z
					.string()
					.min(1)
					.max(1024 * 1024),
				idempotencyKey: z.string().min(8).max(128),
			}),
			scopes: ["mcp:inventory:write"],
			rateLimitCategory: "mcp_write",
			audit: true,
			needsApproval: true,
			handler: async (ctx, a) => {
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
		}),
	];
}

export function registerInventoryTools(
	server: McpServer,
	env: McpToolsEnv,
): void {
	for (const definition of createInventoryToolDefs(env)) {
		registerSharedMcpTool(server, env, definition);
	}
}
