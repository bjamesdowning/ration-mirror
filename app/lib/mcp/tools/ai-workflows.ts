/**
 * Credit-aware AI workflow tools for MCP/Copilot.
 * Advise native deep links, but still perform billed Plan Week / Generate
 * via the same queue pipelines as the web/iOS UI.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { isFeatureEnabled } from "../../feature-flags/flags.server";
import { AI_COSTS, InsufficientCreditsError } from "../../ledger.server";
import { ensureMealPlan } from "../../manifest.server";
import { submitMealGenerate } from "../../meal-generate-submit.server";
import { submitPlanWeek } from "../../plan-week-submit.server";
import { SLOT_TYPES } from "../../schemas/manifest";
import { VARIETY_LEVELS } from "../../schemas/week-plan";
import { err, ok } from "../envelope";
import {
	defineSharedTool,
	type McpToolsEnv,
	registerSharedMcpTool,
} from "../tool-runtime";

function flagContext(userId: string) {
	return { userId };
}

function isReactRouterDataError(
	e: unknown,
): e is { data: unknown; status?: number; init?: { status?: number } } {
	return (
		typeof e === "object" &&
		e !== null &&
		"data" in e &&
		(typeof (e as { status?: unknown }).status === "number" ||
			typeof (e as { init?: { status?: unknown } }).init?.status === "number")
	);
}

function dataErrorMessage(e: unknown): string {
	if (!isReactRouterDataError(e)) return "Request failed.";
	const body = e.data;
	if (body && typeof body === "object" && "error" in body) {
		const msg = (body as { error?: unknown }).error;
		if (typeof msg === "string") return msg;
	}
	return "Request failed.";
}

function dataErrorStatus(e: unknown): number {
	if (!isReactRouterDataError(e)) return 500;
	if (typeof e.status === "number") return e.status;
	if (typeof e.init?.status === "number") return e.init.status;
	return 500;
}

export function createAiWorkflowToolDefs(env: McpToolsEnv) {
	return [
		defineSharedTool({
			name: "start_plan_week",
			description:
				"Start Ration's billed AI Plan Week job (same pipeline as Manifest Plan Week). Spends meal-plan credits. Prefer propose_manifest_plan + commit_manifest_plan for credit-free scheduling from existing meals. Native deep link: ration://manifest/plan-week. Returns requestId for status polling.",
			inputSchema: z.object({
				days: z.number().int().min(1).max(7).optional().default(7),
				startDate: z
					.string()
					.regex(/^\d{4}-\d{2}-\d{2}$/)
					.describe("First day YYYY-MM-DD (UTC)."),
				slots: z
					.array(z.enum(SLOT_TYPES))
					.min(1)
					.max(4)
					.optional()
					.default(["dinner"]),
				tag: z.string().max(50).optional(),
				dietaryNote: z.string().max(200).optional(),
				variety: z.enum(VARIETY_LEVELS).optional().default("medium"),
			}),
			scopes: ["mcp:manifest:write"],
			rateLimitCategory: "mcp_write",
			audit: true,
			needsApproval: true,
			// Credit + queue: do not race-timeout (double-charge risk on retry).
			timeoutMs: null,
			handler: async (ctx, a) => {
				const enabled = await isFeatureEnabled(
					env,
					"ai-plan-week",
					flagContext(ctx.userId),
				);
				if (!enabled) {
					return err(
						"start_plan_week",
						"unauthorized",
						"AI Plan Week is temporarily unavailable.",
						{
							recoveryHint:
								"Use propose_manifest_plan + commit_manifest_plan for credit-free scheduling, or try again later.",
						},
					);
				}
				try {
					const plan = await ensureMealPlan(env.DB, ctx.organizationId);
					const result = await submitPlanWeek(env, {
						userId: ctx.userId,
						organizationId: ctx.organizationId,
						planId: plan.id,
						config: {
							days: a.days ?? 7,
							startDate: a.startDate,
							slots: a.slots ?? ["dinner"],
							tag: a.tag,
							dietaryNote: a.dietaryNote,
							variety: a.variety ?? "medium",
						},
						flagContext: flagContext(ctx.userId),
					});
					return ok("start_plan_week", {
						status: result.status,
						requestId: result.requestId,
						creditsReserved: AI_COSTS.MEAL_PLAN_WEEKLY,
						deepLink: "ration://manifest/plan-week",
						note: "AI Plan Week queued. Open Manifest Plan Week or poll status with the requestId.",
					});
				} catch (e) {
					if (e instanceof InsufficientCreditsError) {
						return err(
							"start_plan_week",
							"capacity_exceeded",
							"Insufficient credits for AI Plan Week.",
							{
								details: { required: e.required, current: e.current },
								recoveryHint:
									"Buy credits or use propose_manifest_plan + commit_manifest_plan (credit-free).",
							},
						);
					}
					const status = dataErrorStatus(e);
					if (status === 400 || status === 404 || status === 403) {
						return err(
							"start_plan_week",
							status === 404 ? "not_found" : "invalid_input",
							dataErrorMessage(e),
							{
								recoveryHint:
									"Add meals to Galley first, or use propose_manifest_plan.",
							},
						);
					}
					throw e;
				}
			},
		}),
		defineSharedTool({
			name: "start_generate_meal",
			description:
				"Start Ration's billed AI meal generation job (same pipeline as Galley Generate). Spends meal-generate credits. For structured recipes without AI credits, use create_meal. Native deep link: ration://galley/generate.",
			inputSchema: z.object({
				customization: z
					.string()
					.max(500)
					.optional()
					.describe("Optional preference note for the generator."),
			}),
			scopes: ["mcp:galley:write"],
			rateLimitCategory: "mcp_write",
			audit: true,
			needsApproval: true,
			timeoutMs: null,
			handler: async (ctx, a) => {
				const enabled = await isFeatureEnabled(
					env,
					"ai-generate-meal",
					flagContext(ctx.userId),
				);
				if (!enabled) {
					return err(
						"start_generate_meal",
						"unauthorized",
						"AI meal generation is temporarily unavailable.",
						{
							recoveryHint:
								"Use create_meal with a structured recipe, or try again later.",
						},
					);
				}
				try {
					const result = await submitMealGenerate(env, {
						userId: ctx.userId,
						organizationId: ctx.organizationId,
						customization: a.customization,
						flagContext: flagContext(ctx.userId),
					});
					return ok("start_generate_meal", {
						status: result.status,
						requestId: result.requestId,
						creditsReserved: AI_COSTS.MEAL_GENERATE,
						deepLink: "ration://galley/generate",
						note: "AI meal generation queued. Review the result in Galley Generate.",
					});
				} catch (e) {
					if (e instanceof InsufficientCreditsError) {
						return err(
							"start_generate_meal",
							"capacity_exceeded",
							"Insufficient credits for AI meal generation.",
							{
								details: { required: e.required, current: e.current },
								recoveryHint:
									"Buy credits or create a structured meal with create_meal.",
							},
						);
					}
					const status = dataErrorStatus(e);
					if (status === 403 || status === 503) {
						return err(
							"start_generate_meal",
							"internal_error",
							dataErrorMessage(e),
							{
								recoveryHint:
									"Try again shortly or use create_meal / Galley Generate.",
							},
						);
					}
					throw e;
				}
			},
		}),
	];
}

export function registerAiWorkflowTools(
	server: McpServer,
	env: McpToolsEnv,
): void {
	for (const definition of createAiWorkflowToolDefs(env)) {
		registerSharedMcpTool(server, env, definition);
	}
}
