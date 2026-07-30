import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
	getKitchenEvents,
	getKitchenStats,
	type KitchenStatsWindow,
	listKitchenEventTypes,
} from "../../kitchen-events.server";
import { kitchenEventTypeSchema } from "../../schemas/kitchen-events";
import { err, ok } from "../envelope";
import {
	defineSharedTool,
	type McpToolsEnv,
	registerSharedMcpTool,
} from "../tool-runtime";

const MAX_EVENTS_LIMIT = 100;
const DEFAULT_EVENTS_LIMIT = 50;

const statsWindowSchema = z.enum(["7d", "30d", "90d", "365d"]);

export function createKitchenEventToolDefs(env: McpToolsEnv) {
	const eventTypeEnum = kitchenEventTypeSchema;
	return [
		defineSharedTool({
			name: "get_kitchen_events",
			description:
				"Return a filterable Flight Recorder timeline of kitchen activity (cooks, docks, expiries, jettisons). Use for questions like 'what did I cook last month?' or 'what expired in March?'. Paginate with cursor from the previous response.",
			inputSchema: z.object({
				types: z
					.array(eventTypeEnum)
					.min(1)
					.max(listKitchenEventTypes().length)
					.optional()
					.describe(
						`Filter to specific event types. Available: ${listKitchenEventTypes().join(", ")}`,
					),
				from: z
					.string()
					.datetime({ offset: true })
					.optional()
					.describe("Inclusive ISO-8601 start of window"),
				to: z
					.string()
					.datetime({ offset: true })
					.optional()
					.describe("Inclusive ISO-8601 end of window"),
				limit: z
					.number()
					.int()
					.min(1)
					.max(MAX_EVENTS_LIMIT)
					.optional()
					.describe(
						`Page size (default ${DEFAULT_EVENTS_LIMIT}, max ${MAX_EVENTS_LIMIT})`,
					),
				cursor: z
					.string()
					.optional()
					.describe(
						"Pagination cursor from a previous nextCursor value (format occurredAtISO|id)",
					),
			}),
			scopes: ["mcp:read"],
			rateLimitCategory: "mcp_list",
			audit: false,
			handler: async (ctx, a) => {
				try {
					const result = await getKitchenEvents(env.DB, ctx.organizationId, {
						types: a.types,
						from: a.from ? new Date(a.from) : undefined,
						to: a.to ? new Date(a.to) : undefined,
						limit: a.limit ?? DEFAULT_EVENTS_LIMIT,
						cursor: a.cursor,
					});
					return ok("get_kitchen_events", {
						events: result.events.map((e) => ({
							id: e.id,
							eventType: e.eventType,
							occurredAt: e.occurredAt.toISOString(),
							subjectName: e.subjectName,
							mealId: e.mealId,
							cargoId: e.cargoId,
							payload: e.payload,
						})),
						nextCursor: result.nextCursor,
						availableTypes: listKitchenEventTypes(),
					});
				} catch (e) {
					return err(
						"get_kitchen_events",
						"internal_error",
						e instanceof Error ? e.message : "Failed to load kitchen events",
					);
				}
			},
		}),
		defineSharedTool({
			name: "get_kitchen_stats",
			description:
				"Return windowed Flight Recorder aggregates: counts by event type, top cooked meals, and totals for cooked / docked / expired / jettisoned.",
			inputSchema: z.object({
				window: statsWindowSchema
					.optional()
					.describe("Aggregation window (default 7d)"),
			}),
			scopes: ["mcp:read"],
			rateLimitCategory: "mcp_list",
			audit: false,
			handler: async (ctx, a) => {
				try {
					const window = (a.window ?? "7d") as KitchenStatsWindow;
					const stats = await getKitchenStats(
						env.DB,
						ctx.organizationId,
						window,
					);
					return ok("get_kitchen_stats", stats);
				} catch (e) {
					return err(
						"get_kitchen_stats",
						"internal_error",
						e instanceof Error ? e.message : "Failed to load kitchen stats",
					);
				}
			},
		}),
	];
}

export function registerKitchenEventTools(
	server: McpServer,
	env: McpToolsEnv,
): void {
	for (const definition of createKitchenEventToolDefs(env)) {
		registerSharedMcpTool(server, env, definition);
	}
}
