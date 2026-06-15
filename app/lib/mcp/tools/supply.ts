import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
	addSupplyItem,
	completeSupplyList,
	createSupplyListFromSelectedMeals,
	deleteSupplyItem,
	ensureSupplyList,
	getSupplyListById,
	updateSupplyItem,
} from "../../supply.server";
import { err, ok } from "../envelope";
import { type McpToolsEnv, makeTool, registerMcpTool } from "../tool-runtime";

export function registerSupplyTools(server: McpServer, env: McpToolsEnv): void {
	registerMcpTool(
		server,
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

	registerMcpTool(
		server,
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

	registerMcpTool(
		server,
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

	registerMcpTool(
		server,
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

	registerMcpTool(
		server,
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

	registerMcpTool(
		server,
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
}
