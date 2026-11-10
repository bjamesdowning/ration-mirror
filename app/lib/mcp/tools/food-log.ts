import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
	isNutritionBarcodeDiaryEnabled,
	isNutritionFuelPageEnabled,
	isNutritionPhotoLogEnabled,
} from "../../nutrition/fast-log-flag.server";
import { lookupFoodBarcode } from "../../nutrition/food-barcode.server";
import { assertFuelCreateRoom } from "../../nutrition/fuel-cap.server";
import { proposeFoodLog } from "../../nutrition/propose-food-log.server";
import { FuelBarcodeSchema } from "../../schemas/fuel";
import { UuidSchema } from "../../schemas/uuid";
import {
	resolveAgentFlagContext,
	resolveAgentSurface,
} from "../agent-flag-context";
import type { McpToolContext } from "../auth";
import { featureDisabled, ok } from "../envelope";
import {
	defineSharedTool,
	type McpToolsEnv,
	registerSharedMcpTool,
} from "../tool-runtime";

function principal(ctx: McpToolContext) {
	const surface = resolveAgentSurface(ctx);
	return {
		userId: ctx.userId,
		organizationId: ctx.organizationId,
		surface,
		authMethod: ctx.authMethod,
		credentialId: ctx.apiKeyId || null,
		clientId: ctx.oauthClientId ?? null,
		scopes: [
			...(ctx.scopes.includes("mcp:nutrition:read") ? ["nutrition:read"] : []),
			...(ctx.scopes.includes("mcp:nutrition:write")
				? ["nutrition:write"]
				: []),
		],
		requestId: crypto.randomUUID(),
	};
}

export function createFoodLogToolDefs(env: McpToolsEnv) {
	return [
		defineSharedTool({
			name: "lookup_food_barcode",
			description:
				"Look up a packaged barcode for a personal food log. Uses USDA Branded Foods and accepts a hit only when gtinUpc matches. A different code is a miss. Open Food Facts is not called. A miss returns found:false and custom_add so the person can type a name and macros. Does not write intake, Cargo, or Supply. Requires nutrition-barcode-diary and nutrition-fast-log. iOS below 1.6.0 stays disabled. Not medical advice.",
			inputSchema: z.object({
				barcode: FuelBarcodeSchema,
			}),
			scopes: ["mcp:nutrition:read"],
			rateLimitCategory: "mcp_list",
			audit: false,
			readOnlyHint: true,
			handler: async (ctx, args) => {
				const flagContext = resolveAgentFlagContext(env, ctx);
				if (!(await isNutritionBarcodeDiaryEnabled(env, flagContext))) {
					return featureDisabled(
						"lookup_food_barcode",
						"Barcode food log is unavailable.",
						"Enable nutrition-barcode-diary. The parent nutrition-fast-log must also be on. iOS below 1.6.0 stays disabled.",
					);
				}
				if (await isNutritionFuelPageEnabled(env, flagContext)) {
					await assertFuelCreateRoom(env.DB, ctx.userId, new Date());
				}
				const result = await lookupFoodBarcode(env, args.barcode);
				return ok("lookup_food_barcode", result, { outcome: "no_effect" });
			},
		}),
		defineSharedTool({
			name: "propose_food_log",
			description:
				"Draft a personal food log from a photo reference. Returns a draft id and lines. Does not insert intake, Cargo, or Supply. Commit the edited lines with log_diary_food. A model call costs 2 credits, the same as a Cargo scan, and requires approval. No photo reference returns capability_unavailable and does not debit. Typed, recent, and custom-amount logs do not use this tool and debit 0. Requires nutrition-photo-log and nutrition-fast-log. iOS below 1.6.0 stays disabled. Not medical advice.",
			inputSchema: z.object({
				operationKey: UuidSchema,
				photoRef: z.string().trim().min(1).max(8_000_000).optional(),
				subject: z
					.enum(["packaged", "meal", "loose_produce", "custom"])
					.optional(),
				barcode: FuelBarcodeSchema.optional(),
			}),
			scopes: ["mcp:nutrition:write"],
			rateLimitCategory: "mcp_write",
			audit: true,
			needsApproval: true,
			idempotentHint: true,
			handler: async (ctx, args) => {
				const flagContext = resolveAgentFlagContext(env, ctx);
				if (await isNutritionFuelPageEnabled(env, flagContext)) {
					return featureDisabled(
						"propose_food_log",
						"Scan to Fuel uses the photo queue.",
						"nutrition-fuel-page is on. propose_food_log does not call the model.",
					);
				}
				if (!(await isNutritionPhotoLogEnabled(env, flagContext))) {
					return featureDisabled(
						"propose_food_log",
						"Photo food log is unavailable.",
						"Enable nutrition-photo-log. The parent nutrition-fast-log must also be on. iOS below 1.6.0 stays disabled.",
					);
				}
				const result = await proposeFoodLog(
					env,
					principal(ctx),
					flagContext,
					args,
				);
				return ok("propose_food_log", result, {
					outcome: result.replayed ? "replayed" : "committed",
					operationId: args.operationKey,
				});
			},
		}),
	];
}

export async function registerFoodLogTools(
	server: McpServer,
	env: McpToolsEnv,
): Promise<void> {
	const flagContext = resolveAgentFlagContext(env, env.__mcp);
	const [barcode, photo] = await Promise.all([
		isNutritionBarcodeDiaryEnabled(env, flagContext),
		isNutritionPhotoLogEnabled(env, flagContext),
	]);
	for (const definition of createFoodLogToolDefs(env)) {
		if (definition.name === "lookup_food_barcode" && !barcode) continue;
		if (definition.name === "propose_food_log" && !photo) continue;
		registerSharedMcpTool(server, env, definition);
	}
}
