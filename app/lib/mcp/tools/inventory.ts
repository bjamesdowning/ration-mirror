import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ingestCargoItems, jettisonItem, updateItem } from "../../cargo.server";
import {
	applyInventoryImport,
	getInventoryImportSchema,
	type InventoryImportItem,
	importInventoryCsv,
	previewInventoryImport,
} from "../../inventory-import.server";
import { toSupportedUnit } from "../../units";
import { err, ok } from "../envelope";
import { type McpToolsEnv, makeTool, registerMcpTool } from "../tool-runtime";

export function registerInventoryTools(
	server: McpServer,
	env: McpToolsEnv,
): void {
	registerMcpTool(
		server,
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

	registerMcpTool(
		server,
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

	registerMcpTool(
		server,
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

	registerMcpTool(
		server,
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

	registerMcpTool(
		server,
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

	registerMcpTool(
		server,
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

	registerMcpTool(
		server,
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
}
