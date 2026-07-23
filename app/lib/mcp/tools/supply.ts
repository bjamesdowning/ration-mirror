import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getUserSettings } from "../../auth.server";
import {
	addSupplyItem,
	completeSupplyList,
	createSupplyListFromSelectedMeals,
	deleteSupplyItem,
	ensureSupplyList,
	getSupplyListById,
	updateSupplyItem,
} from "../../supply.server";
import { resolveUnitDisplayMode } from "../../unit-display-mode";
import { err, ok } from "../envelope";
import {
	defineSharedTool,
	type McpToolsEnv,
	registerSharedMcpTool,
} from "../tool-runtime";

export function createSupplyToolDefs(env: McpToolsEnv) {
	return [
		defineSharedTool({
			name: "add_supply_item",
			description: "Add an item to the active supply/shopping list.",
			inputSchema: z.object({
				name: z.string().min(1),
				quantity: z.number().positive().optional(),
				unit: z.string().optional(),
				domain: z
					.enum(["food", "household", "alcohol"])
					.optional()
					.default("food"),
			}),
			scopes: ["mcp:supply:write"],
			rateLimitCategory: "mcp_write",
			audit: true,
			handler: async (ctx, a) => {
				const list = await ensureSupplyList(env.DB, ctx.organizationId);
				if (!list) {
					return err(
						"add_supply_item",
						"internal_error",
						"Could not locate or create supply list.",
					);
				}
				const item = await addSupplyItem(env.DB, ctx.organizationId, list.id, {
					name: a.name,
					quantity: a.quantity,
					unit: a.unit,
					domain: a.domain ?? "food",
				});
				return ok("add_supply_item", {
					id: item.id,
					name: item.name,
					quantity: item.quantity,
					unit: item.unit,
				});
			},
		}),
		defineSharedTool({
			name: "update_supply_item",
			description:
				"Update an existing supply list item. Quantity may be 0 (still needed / reminder to buy); the line stays on the list. Use remove_supply_item to delete the line.",
			inputSchema: z.object({
				itemId: z.string().uuid(),
				name: z.string().min(1).optional(),
				quantity: z
					.number()
					.min(
						0,
						"Quantity cannot be negative. 0 keeps the line as a buy reminder.",
					)
					.optional(),
				unit: z.string().optional(),
			}),
			scopes: ["mcp:supply:write"],
			rateLimitCategory: "mcp_write",
			audit: true,
			handler: async (ctx, a) => {
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
						{
							recoveryHint:
								"Call get_supply_list to find a valid itemId on the active list.",
						},
					);
				}
				return ok("update_supply_item", {
					id: item.id,
					name: item.name,
					quantity: item.quantity,
					unit: item.unit,
				});
			},
		}),
		defineSharedTool({
			name: "remove_supply_item",
			description:
				"Remove an item from the supply list. If the user bought it, prefer mark_supply_purchased_bulk then complete_supply_list.",
			inputSchema: z.object({ itemId: z.string().uuid() }),
			scopes: ["mcp:supply:write"],
			rateLimitCategory: "mcp_write",
			audit: true,
			handler: async (ctx, a) => {
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
		}),
		defineSharedTool({
			name: "mark_supply_purchased_bulk",
			description:
				"Purpose-built: mark many supply list items purchased/unpurchased in one call (max 50). Use for one or many items.",
			inputSchema: z.object({
				itemIds: z.array(z.string().uuid()).min(1).max(50),
				purchased: z.boolean().optional().default(true),
			}),
			scopes: ["mcp:supply:write"],
			rateLimitCategory: "mcp_write",
			audit: true,
			handler: async (ctx, a) => {
				const list = await ensureSupplyList(env.DB, ctx.organizationId);
				if (!list) {
					return err(
						"mark_supply_purchased_bulk",
						"internal_error",
						"Could not locate or create supply list.",
					);
				}
				const purchased = a.purchased ?? true;
				const results = await Promise.all(
					a.itemIds.map(async (itemId) => {
						const item = await updateSupplyItem(
							env.DB,
							ctx.organizationId,
							list.id,
							itemId,
							{ isPurchased: purchased },
						);
						return { itemId, ok: !!item };
					}),
				);
				const updatedIds = results.filter((r) => r.ok).map((r) => r.itemId);
				const missing = results.filter((r) => !r.ok).map((r) => r.itemId);
				return ok("mark_supply_purchased_bulk", {
					updated: updatedIds.length,
					itemIds: updatedIds,
					missing: missing.length > 0 ? missing : undefined,
					isPurchased: purchased,
				});
			},
		}),
		defineSharedTool({
			name: "sync_supply_from_selected_meals",
			description:
				"Rebuild the shopping list from this week's meal plan + Galley active selections (same as Supply → Update list). Uses semantic matching vs pantry; may call Vectorize. Rate-limited separately from regular writes.",
			inputSchema: z.object({
				unitMode: z.enum(["metric", "imperial"]).optional(),
			}),
			scopes: ["mcp:supply:write"],
			rateLimitCategory: "mcp_supply_sync",
			audit: true,
			handler: async (ctx, a) => {
				const result = await createSupplyListFromSelectedMeals(
					env,
					ctx.organizationId,
					undefined,
					{ trigger: "mcp_sync_supply", organizationId: ctx.organizationId },
					a.unitMode ?? "metric",
					ctx.userId,
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
		}),
		defineSharedTool({
			name: "complete_supply_list",
			description:
				"Dock all purchased items from the active supply list into pantry inventory and remove them from the list. Destructive — pass confirm:true.",
			inputSchema: z.object({ confirm: z.boolean() }),
			scopes: ["mcp:supply:write", "mcp:inventory:write"],
			rateLimitCategory: "mcp_write",
			audit: true,
			needsApproval: true,
			handler: async (ctx, a) => {
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
				const userSettings = await getUserSettings(env.DB, ctx.userId);
				const unitDisplayMode = resolveUnitDisplayMode(userSettings);
				const result = await completeSupplyList(
					env,
					ctx.organizationId,
					list.id,
					{ unitMode: unitDisplayMode, userId: ctx.userId },
				);
				return ok("complete_supply_list", result);
			},
		}),
	];
}

export function registerSupplyTools(server: McpServer, env: McpToolsEnv): void {
	for (const definition of createSupplyToolDefs(env)) {
		registerSharedMcpTool(server, env, definition);
	}
}
