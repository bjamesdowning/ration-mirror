import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getUserSettings, patchUserSettings } from "../../auth.server";
import {
	logDiaryFood,
	quoteFoodLog,
	saveDiaryFoodToKitchen,
	updateDiaryFood,
	voidDiaryFood,
} from "../../nutrition/diary.server";
import { normalizeDiaryLayout } from "../../nutrition/diary-layout";
import { isNutritionFastLogEnabled } from "../../nutrition/fast-log-flag.server";
import {
	DiaryFoodWriteSchema,
	DiaryKitchenSaveSchema,
	DiaryVoidSchema,
} from "../../schemas/diary";
import { UuidSchema } from "../../schemas/uuid";
import {
	resolveAgentFlagContext,
	resolveAgentSurface,
} from "../agent-flag-context";
import type { McpToolContext } from "../auth";
import { err, featureDisabled, ok } from "../envelope";
import {
	defineSharedTool,
	type McpToolsEnv,
	registerSharedMcpTool,
} from "../tool-runtime";

function diaryPrincipal(ctx: McpToolContext) {
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

const diaryWriteFields = {
	name: z.string().trim().min(1).max(120),
	manifestDate: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.optional(),
	occurredAt: z.string().datetime({ offset: true }).optional(),
	slotType: z
		.enum(["breakfast", "lunch", "dinner", "snack"])
		.nullable()
		.optional(),
	amount: z.number().finite().positive().optional(),
	unit: z.enum(["serving", "g", "oz"]).optional(),
	energyKcal: z.number().finite().nonnegative(),
	proteinG: z.number().finite().nonnegative(),
	carbsG: z.number().finite().nonnegative(),
	fatG: z.number().finite().nonnegative(),
	fiberG: z.number().finite().nonnegative().nullable().optional(),
	idempotencyKey: UuidSchema,
	operationKey: UuidSchema,
	notes: z.string().trim().max(280).nullable().optional(),
};

function toDiaryWrite(args: {
	name: string;
	manifestDate?: string;
	occurredAt?: string;
	slotType?: "breakfast" | "lunch" | "dinner" | "snack" | null;
	amount?: number;
	unit?: "serving" | "g" | "oz";
	energyKcal: number;
	proteinG: number;
	carbsG: number;
	fatG: number;
	fiberG?: number | null;
	idempotencyKey: string;
	operationKey: string;
	notes?: string | null;
}) {
	return DiaryFoodWriteSchema.parse({
		name: args.name,
		manifestDate: args.manifestDate,
		occurredAt: args.occurredAt,
		slotType: args.slotType,
		amount: args.amount,
		unit: args.unit,
		macros: {
			energyKcal: args.energyKcal,
			proteinG: args.proteinG,
			carbsG: args.carbsG,
			fatG: args.fatG,
			fiberG: args.fiberG,
		},
		idempotencyKey: args.idempotencyKey,
		operationKey: args.operationKey,
		notes: args.notes,
	});
}

export function createDiaryToolDefs(env: McpToolsEnv) {
	return [
		defineSharedTool({
			name: "quote_food_log",
			description:
				"Quote the credit cost of a personal food log before it runs. Typed, recent, and custom-macro logs cost 0. This tool does not debit, does not insert intake, and does not call a model. Requires nutrition-fast-log. Not medical advice.",
			inputSchema: z.object({}),
			scopes: ["mcp:nutrition:read"],
			rateLimitCategory: "mcp_list",
			audit: false,
			readOnlyHint: true,
			handler: async (ctx) => {
				const flagContext = resolveAgentFlagContext(env, ctx);
				if (!(await isNutritionFastLogEnabled(env, flagContext))) {
					return featureDisabled(
						"quote_food_log",
						"Personal food log is unavailable.",
						"Enable nutrition-fast-log. iOS clients below 1.6.0 stay disabled.",
					);
				}
				const quote = await quoteFoodLog(env, diaryPrincipal(ctx), flagContext);
				return ok("quote_food_log", quote, { outcome: "no_effect" });
			},
		}),
		defineSharedTool({
			name: "log_diary_food",
			description:
				"Log one personal food the caller ate. Writes nutrition intake with a null plan entry and does not change Cargo, Galley, Manifest, or Supply. Requires approval even for one item, active intake consent, and agent-processing consent. Pass name, explicit energyKcal/proteinG/carbsG/fatG (fiberG optional), optional amount+unit (serving, g, or oz), manifestDate, occurredAt, slotType, notes, idempotencyKey, and operationKey. Costs 0 credits. Does not save to the kitchen; the result includes kitchenOffer only. Not medical advice.",
			inputSchema: z.object(diaryWriteFields),
			scopes: ["mcp:nutrition:write"],
			rateLimitCategory: "mcp_write",
			audit: true,
			needsApproval: true,
			idempotentHint: true,
			handler: async (ctx, args) => {
				const flagContext = resolveAgentFlagContext(env, ctx);
				if (!(await isNutritionFastLogEnabled(env, flagContext))) {
					return featureDisabled(
						"log_diary_food",
						"Personal food log is unavailable.",
						"Enable nutrition-fast-log. Do not route a personal food through log_manifest_intake.",
					);
				}
				const parsed = DiaryFoodWriteSchema.safeParse(toDiaryWrite(args));
				if (!parsed.success) {
					return err("log_diary_food", "invalid_input", "Invalid food log.", {
						details: parsed.error.flatten(),
					});
				}
				const result = await logDiaryFood(
					env,
					diaryPrincipal(ctx),
					flagContext,
					parsed.data,
				);
				return ok("log_diary_food", result, {
					outcome: result.replayed ? "replayed" : "committed",
					operationId: result.operationId,
				});
			},
		}),
		defineSharedTool({
			name: "update_diary_food",
			description:
				"Replace the caller's personal food log. Voids the previous row and writes a new one. Does not change Cargo or the plan. Requires approval. Same fields as log_diary_food plus intakeId. Costs 0 credits. Not medical advice.",
			inputSchema: z.object({
				intakeId: UuidSchema,
				...diaryWriteFields,
			}),
			scopes: ["mcp:nutrition:write"],
			rateLimitCategory: "mcp_write",
			audit: true,
			needsApproval: true,
			idempotentHint: true,
			handler: async (ctx, args) => {
				const flagContext = resolveAgentFlagContext(env, ctx);
				if (!(await isNutritionFastLogEnabled(env, flagContext))) {
					return featureDisabled(
						"update_diary_food",
						"Personal food log is unavailable.",
						"Enable nutrition-fast-log.",
					);
				}
				const parsed = DiaryFoodWriteSchema.safeParse(toDiaryWrite(args));
				if (!parsed.success) {
					return err(
						"update_diary_food",
						"invalid_input",
						"Invalid food log.",
						{
							details: parsed.error.flatten(),
						},
					);
				}
				const result = await updateDiaryFood(
					env,
					diaryPrincipal(ctx),
					flagContext,
					args.intakeId,
					parsed.data,
				);
				return ok("update_diary_food", result, {
					outcome: result.replayed ? "replayed" : "committed",
					operationId: result.operationId,
				});
			},
		}),
		defineSharedTool({
			name: "void_diary_food",
			description:
				"Void the caller's personal food log. Does not restore Cargo or uncook a plan entry. Destructive — pass confirm:true. Requires approval, intake consent, and agent-processing consent. Costs 0 credits.",
			inputSchema: DiaryVoidSchema.extend({ intakeId: UuidSchema }),
			scopes: ["mcp:nutrition:write"],
			rateLimitCategory: "mcp_write",
			audit: true,
			needsApproval: true,
			destructiveHint: true,
			idempotentHint: true,
			handler: async (ctx, args) => {
				if (!args.confirm) {
					return err(
						"void_diary_food",
						"invalid_input",
						"Pass confirm:true to void this personal food log.",
					);
				}
				const flagContext = resolveAgentFlagContext(env, ctx);
				if (!(await isNutritionFastLogEnabled(env, flagContext))) {
					return featureDisabled(
						"void_diary_food",
						"Personal food log is unavailable.",
						"Enable nutrition-fast-log.",
					);
				}
				const result = await voidDiaryFood(
					env,
					diaryPrincipal(ctx),
					flagContext,
					args.intakeId,
					args,
				);
				return ok("void_diary_food", result, {
					outcome: result.replayed ? "replayed" : "committed",
					operationId: result.operationId,
				});
			},
		}),
		defineSharedTool({
			name: "save_diary_food_to_kitchen",
			description:
				"Copy one personal food log into the active kitchen as a Cargo item or a Galley meal. Does not run from log_diary_food. Does not change who owns the intake row. Destructive for the shared kitchen — pass confirm:true. Requires approval. Refuses without confirm and writes nothing. Capacity errors use the existing upgrade path. Costs 0 credits.",
			inputSchema: DiaryKitchenSaveSchema.extend({ intakeId: UuidSchema }),
			scopes: ["mcp:nutrition:write"],
			rateLimitCategory: "mcp_write",
			audit: true,
			needsApproval: true,
			destructiveHint: true,
			idempotentHint: true,
			handler: async (ctx, args) => {
				if (!args.confirm) {
					return err(
						"save_diary_food_to_kitchen",
						"invalid_input",
						"Pass confirm:true to copy this food into the kitchen.",
					);
				}
				const flagContext = resolveAgentFlagContext(env, ctx);
				if (!(await isNutritionFastLogEnabled(env, flagContext))) {
					return featureDisabled(
						"save_diary_food_to_kitchen",
						"Personal food log is unavailable.",
						"Enable nutrition-fast-log.",
					);
				}
				const result = await saveDiaryFoodToKitchen(
					env,
					diaryPrincipal(ctx),
					flagContext,
					args.intakeId,
					args,
				);
				return ok("save_diary_food_to_kitchen", result, {
					outcome: result.replayed ? "replayed" : "committed",
					operationId: result.operationId,
				});
			},
		}),
		defineSharedTool({
			name: "set_diary_layout",
			description:
				"Set how this person sees their own day list: timeline (default, ordered by time) or slots (breakfast, lunch, dinner, snack; a row with no slot stays in Other). Person setting only. Does not change another household member, Cargo, or the plan. Requires approval. Requires nutrition-fast-log. iOS below 1.6.0 stays disabled.",
			inputSchema: z.object({
				layout: z.enum(["timeline", "slots"]),
			}),
			scopes: ["mcp:preferences:write"],
			rateLimitCategory: "mcp_write",
			audit: true,
			needsApproval: true,
			idempotentHint: true,
			handler: async (ctx, args) => {
				const flagContext = resolveAgentFlagContext(env, ctx);
				if (!(await isNutritionFastLogEnabled(env, flagContext))) {
					return featureDisabled(
						"set_diary_layout",
						"Personal food log is unavailable.",
						"Enable nutrition-fast-log. iOS clients below 1.6.0 stay disabled.",
					);
				}
				await patchUserSettings(env.DB, ctx.userId, {
					diaryLayout: args.layout,
				});
				const settings = await getUserSettings(env.DB, ctx.userId);
				return ok("set_diary_layout", {
					diaryLayout: normalizeDiaryLayout(settings.diaryLayout),
				});
			},
		}),
	];
}

export async function registerDiaryNutritionTools(
	server: McpServer,
	env: McpToolsEnv,
): Promise<void> {
	const flagContext = resolveAgentFlagContext(env, env.__mcp);
	if (!(await isNutritionFastLogEnabled(env, flagContext))) return;
	for (const definition of createDiaryToolDefs(env)) {
		registerSharedMcpTool(server, env, definition);
	}
}
