import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getUserSettings } from "../../auth.server";
import { isFeatureEnabled } from "../../feature-flags/flags.server";
import {
	addSupplyItem,
	completeSupplyList,
	createSupplyListFromSelectedMeals,
	deleteSupplyItem,
	ensureSupplyList,
	getSupplyListById,
	updateSupplyItem,
} from "../../supply.server";
import { SUPPLY_MULTI_LISTS_FLAG } from "../../supply-list-kinds";
import { requireSupplyListTarget } from "../../supply-list-target.server";
import {
	archiveSupplyList,
	createCatalogList,
	createSupplyListFromReceipt,
	deleteSupplyStaple,
	duplicateSupplyList,
	getSupplyCatalog,
	listSupplyStaples,
	transferSupplyItems,
	upsertSupplyStaple,
} from "../../supply-lists.server";
import { resolveUnitDisplayMode } from "../../unit-display-mode";
import { resolveAgentFlagContext } from "../agent-flag-context";
import type { McpToolContext } from "../auth";
import { err, featureDisabled, ok, type ToolEnvelope } from "../envelope";
import {
	defineSharedTool,
	type McpToolsEnv,
	registerSharedMcpTool,
} from "../tool-runtime";

const SUPPLY_LIBRARY_OFF_HINT =
	"Use the Live Supply list, or enable the supply list library.";

async function requireSupplyLibrary(
	env: McpToolsEnv,
	ctx: McpToolContext,
	tool: string,
) {
	const enabled = await isFeatureEnabled(
		env,
		SUPPLY_MULTI_LISTS_FLAG,
		resolveAgentFlagContext(env, ctx),
	);
	if (!enabled) {
		return featureDisabled(
			tool,
			"Supply list library is not available.",
			SUPPLY_LIBRARY_OFF_HINT,
		);
	}
	return null;
}

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
				listId: z.string().uuid().optional(),
			}),
			scopes: ["mcp:supply:write"],
			rateLimitCategory: "mcp_write",
			audit: true,
			handler: async (ctx, a) => {
				let list = await ensureSupplyList(env.DB, ctx.organizationId);
				if (a.listId) {
					const enabled = await isFeatureEnabled(
						env,
						SUPPLY_MULTI_LISTS_FLAG,
						resolveAgentFlagContext(env, ctx),
					);
					if (!enabled) {
						return featureDisabled(
							"add_supply_item",
							"Supply list library is not available.",
						);
					}
					await requireSupplyListTarget(env.DB, ctx.organizationId, a.listId, {
						multiListsEnabled: true,
						allowedStates: ["live", "saved"],
					});
					list = await getSupplyListById(env.DB, ctx.organizationId, a.listId);
				}
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
			inputSchema: z.object({
				confirm: z.boolean(),
				listId: z.string().uuid().optional(),
			}),
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
				let list = await ensureSupplyList(env.DB, ctx.organizationId);
				if (a.listId) {
					const enabled = await isFeatureEnabled(
						env,
						SUPPLY_MULTI_LISTS_FLAG,
						resolveAgentFlagContext(env, ctx),
					);
					if (!enabled) {
						return featureDisabled(
							"complete_supply_list",
							"Supply list library is not available.",
						);
					}
					await requireSupplyListTarget(env.DB, ctx.organizationId, a.listId, {
						multiListsEnabled: true,
						allowedStates: ["live", "saved"],
					});
					list = await getSupplyListById(env.DB, ctx.organizationId, a.listId);
				}
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
		defineSharedTool({
			name: "list_supply_lists",
			description:
				"List Live, Saved, Template, and Archived supply lists for this kitchen. Requires the supply list library flag.",
			inputSchema: z.object({}),
			scopes: ["mcp:read"],
			rateLimitCategory: "mcp_list",
			audit: false,
			handler: async (ctx) => {
				const blocked = await requireSupplyLibrary(
					env,
					ctx,
					"list_supply_lists",
				);
				if (blocked) return blocked;
				const catalog = await getSupplyCatalog(env, ctx.organizationId);
				return ok("list_supply_lists", catalog);
			},
		}),
		defineSharedTool({
			name: "create_supply_list",
			description:
				"Create a Saved or Template supply list. Requires the supply list library flag.",
			inputSchema: z.object({
				name: z.string().min(1).max(100),
				kind: z.enum(["saved", "template"]).optional(),
			}),
			scopes: ["mcp:supply:write"],
			rateLimitCategory: "mcp_write",
			audit: true,
			handler: async (ctx, a) => {
				const blocked = await requireSupplyLibrary(
					env,
					ctx,
					"create_supply_list",
				);
				if (blocked) return blocked;
				const list = await createCatalogList({
					env,
					organizationId: ctx.organizationId,
					name: a.name,
					kind: a.kind ?? "saved",
				});
				return ok("create_supply_list", {
					id: list?.id,
					name: list?.name,
					kind: list?.kind,
				});
			},
		}),
		defineSharedTool({
			name: "duplicate_supply_list",
			description:
				"Duplicate a supply list into a Saved or Template copy. Requires the supply list library flag.",
			inputSchema: z.object({
				listId: z.string().uuid(),
				name: z.string().min(1).max(100).optional(),
				kind: z.enum(["saved", "template"]).optional(),
			}),
			scopes: ["mcp:supply:write"],
			rateLimitCategory: "mcp_write",
			audit: true,
			handler: async (ctx, a) => {
				const blocked = await requireSupplyLibrary(
					env,
					ctx,
					"duplicate_supply_list",
				);
				if (blocked) return blocked;
				const list = await duplicateSupplyList({
					env,
					organizationId: ctx.organizationId,
					listId: a.listId,
					name: a.name,
					kind: a.kind,
				});
				return ok("duplicate_supply_list", {
					id: list?.id,
					name: list?.name,
					kind: list?.kind,
				});
			},
		}),
		defineSharedTool({
			name: "archive_supply_list",
			description:
				"Archive a Saved supply list. Live cannot be archived. Requires the supply list library flag.",
			inputSchema: z.object({
				listId: z.string().uuid(),
			}),
			scopes: ["mcp:supply:write"],
			rateLimitCategory: "mcp_write",
			audit: true,
			handler: async (ctx, a) => {
				const blocked = await requireSupplyLibrary(
					env,
					ctx,
					"archive_supply_list",
				);
				if (blocked) return blocked;
				const list = await archiveSupplyList(
					env.DB,
					ctx.organizationId,
					a.listId,
				);
				return ok("archive_supply_list", {
					id: list?.id,
					name: list?.name,
					archivedAt: list?.archivedAt ?? null,
				});
			},
		}),
		defineSharedTool({
			name: "transfer_supply_items",
			description:
				"Copy or move selected items between supply lists. Requires the supply list library flag.",
			inputSchema: z.object({
				sourceListId: z.string().uuid(),
				targetListId: z.string().uuid(),
				itemIds: z.array(z.string().uuid()).min(1),
				mode: z.enum(["copy", "move"]),
			}),
			scopes: ["mcp:supply:write"],
			rateLimitCategory: "mcp_write",
			audit: true,
			handler: async (ctx, a) => {
				const blocked = await requireSupplyLibrary(
					env,
					ctx,
					"transfer_supply_items",
				);
				if (blocked) return blocked;
				const result = await transferSupplyItems({
					env,
					organizationId: ctx.organizationId,
					sourceListId: a.sourceListId,
					targetListId: a.targetListId,
					itemIds: a.itemIds,
					mode: a.mode,
				});
				return ok("transfer_supply_items", {
					sourceId: result.source?.id,
					targetId: result.target?.id,
				});
			},
		}),
		defineSharedTool({
			name: "manage_supply_staples",
			description:
				"List, upsert, or delete kitchen staples used to seed Saved lists. Requires the supply list library flag.",
			inputSchema: z.object({
				action: z.enum(["list", "upsert", "delete"]),
				stapleId: z.string().uuid().optional(),
				name: z.string().min(1).max(200).optional(),
				quantity: z.number().positive().optional(),
				unit: z.string().optional(),
				domain: z.enum(["food", "household", "alcohol"]).optional(),
			}),
			scopes: ["mcp:supply:write"],
			rateLimitCategory: "mcp_write",
			audit: true,
			handler: async (ctx, a): Promise<ToolEnvelope<unknown>> => {
				const blocked = await requireSupplyLibrary(
					env,
					ctx,
					"manage_supply_staples",
				);
				if (blocked) return blocked;
				if (a.action === "list") {
					const staples = await listSupplyStaples(env.DB, ctx.organizationId);
					return ok("manage_supply_staples", { staples });
				}
				if (a.action === "delete") {
					if (!a.stapleId) {
						return err(
							"manage_supply_staples",
							"invalid_input",
							"stapleId is required to delete a staple.",
						);
					}
					await deleteSupplyStaple(env.DB, ctx.organizationId, a.stapleId);
					return ok("manage_supply_staples", { deleted: true });
				}
				if (!a.name) {
					return err(
						"manage_supply_staples",
						"invalid_input",
						"name is required to upsert a staple.",
					);
				}
				const staple = await upsertSupplyStaple(env.DB, ctx.organizationId, {
					name: a.name,
					quantity: a.quantity ?? 1,
					unit: a.unit ?? "unit",
					domain: a.domain ?? "food",
				});
				return ok("manage_supply_staples", { staple });
			},
		}),
		defineSharedTool({
			name: "save_receipt_as_supply_list",
			description:
				"Save reviewed receipt lines as a Saved supply list. Does not charge a second AI credit. Requires the supply list library flag.",
			inputSchema: z.object({
				scanRequestId: z.string().min(1),
				name: z.string().min(1).max(100),
				items: z
					.array(
						z.object({
							name: z.string().min(1),
							quantity: z.number().positive(),
							unit: z.string(),
							domain: z.enum(["food", "household", "alcohol"]).optional(),
						}),
					)
					.min(1),
			}),
			scopes: ["mcp:supply:write"],
			rateLimitCategory: "mcp_write",
			audit: true,
			handler: async (ctx, a) => {
				const blocked = await requireSupplyLibrary(
					env,
					ctx,
					"save_receipt_as_supply_list",
				);
				if (blocked) return blocked;
				const list = await createSupplyListFromReceipt({
					env,
					organizationId: ctx.organizationId,
					scanRequestId: a.scanRequestId,
					name: a.name,
					items: a.items.map((item) => ({
						name: item.name,
						quantity: item.quantity,
						unit: item.unit,
						domain: item.domain ?? "food",
					})),
				});
				return ok("save_receipt_as_supply_list", {
					id: list?.id,
					name: list?.name,
				});
			},
		}),
	];
}

export function registerSupplyTools(server: McpServer, env: McpToolsEnv): void {
	for (const definition of createSupplyToolDefs(env)) {
		registerSharedMcpTool(server, env, definition);
	}
}
