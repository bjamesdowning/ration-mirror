/**
 * Shared MCP/Copilot Quick Eat tool — resolve or create cargo, then plate-up.
 */

import { z } from "zod";
import {
	getCargoByIds,
	getCargoItem,
	ingestCargoItems,
} from "../../cargo.server";
import { fetchOrgCargoIndex } from "../../cargo-index.server";
import {
	QuickEatNotFoundError,
	type QuickEatResult,
	QuickEatValidationError,
	quickEatFromCargo,
} from "../../cargo-quick-eat.server";
import { getUtcTodayISO, normalizeForCargoKey } from "../../cargo-utils";
import { isFeatureEnabled } from "../../feature-flags/flags.server";
import { IntakeNotesSchema } from "../../schemas/manifest";
import { coerceToolUnit } from "../../units";
import { findSimilarCargoBatch } from "../../vector.server";
import {
	resolveAgentFlagContext,
	resolveAgentSurface,
} from "../agent-flag-context";
import type { McpToolContext } from "../auth";
import { err, featureDisabled, ok, type ToolEnvelope } from "../envelope";
import { defineSharedTool, type McpToolsEnv } from "../tool-runtime";

const QUICK_EAT_NAME_SCORE_GAP = 0.1;

function nutritionPrincipal(ctx: McpToolContext) {
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

type QuickEatCandidate = {
	id: string;
	name: string;
	quantity: number;
	unit: string;
	matchScore?: number;
};

type QuickEatCargoData =
	| {
			eaten: false;
			requiresDisambiguation: true;
			candidates: QuickEatCandidate[];
			note: string;
	  }
	| ({
			eaten: true;
			created: boolean;
	  } & QuickEatResult);

function disambiguationOk(candidates: QuickEatCandidate[], query: string) {
	return ok("quick_eat_cargo", {
		eaten: false as const,
		requiresDisambiguation: true as const,
		candidates,
		note: `Multiple pantry items matched "${query}". Ask which one, then retry quick_eat_cargo with that cargoId.`,
	});
}

export function createQuickEatToolDefs(env: McpToolsEnv) {
	return [
		defineSharedTool({
			name: "quick_eat_cargo",
			description:
				"Log that the caller personally ate a pantry item (Quick Eat). Resolves by cargoId or name; if no Cargo line exists, creates one for the eaten amount then deducts it (net 0, line kept as a restock reminder). Places a Manifest snack and optionally logs private intake. Use for 'I ate / just ate / had a snack of X'. Do not use adjust_cargo_item for personal eating. stockWasShort is expected when they ate more than stock. Requires cargo-quick-eat + nutrition-cook-log-split. Not medical advice.",
			inputSchema: z.object({
				cargoId: z.string().uuid().optional(),
				name: z
					.string()
					.min(1)
					.optional()
					.describe("Used when cargoId is unknown; resolved or created."),
				quantity: z.number().positive(),
				unit: z
					.string()
					.optional()
					.describe(
						"Measurement unit. Prefer SI symbols (g, kg, ml, l). Defaults to unit (count) when creating a missing line.",
					),
				date: z
					.string()
					.regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD")
					.optional()
					.describe("UTC calendar date (defaults to today UTC)"),
				operationKey: z.string().uuid(),
				logIntake: z.boolean().optional().default(true),
				notes: IntakeNotesSchema,
			}),
			scopes: [
				"mcp:inventory:write",
				"mcp:manifest:write",
				"mcp:nutrition:write",
			],
			rateLimitCategory: "mcp_write",
			audit: true,
			idempotentHint: true,
			handler: async (ctx, a): Promise<ToolEnvelope<QuickEatCargoData>> => {
				if (!a.cargoId && !a.name) {
					return err(
						"quick_eat_cargo",
						"invalid_input",
						"Provide cargoId or name.",
						{
							recoveryHint:
								"Retry with cargoId from list_inventory, or the food name the user ate.",
						},
					);
				}
				if (a.cargoId && a.name) {
					return err(
						"quick_eat_cargo",
						"invalid_input",
						"Provide cargoId or name, not both.",
					);
				}

				const flagContext = resolveAgentFlagContext(env, ctx);
				const [quickEatOn, splitOn] = await Promise.all([
					isFeatureEnabled(env, "cargo-quick-eat", flagContext),
					isFeatureEnabled(env, "nutrition-cook-log-split", flagContext),
				]);
				if (!quickEatOn || !splitOn) {
					return featureDisabled(
						"quick_eat_cargo",
						"Quick Eat is unavailable while cargo-quick-eat or nutrition-cook-log-split is off.",
						"Enable those flags, or use adjust_cargo_item for pantry-only used/wasted without personal intake.",
					);
				}

				let cargoId = a.cargoId;
				let created = false;

				if (!cargoId && a.name) {
					const index = await fetchOrgCargoIndex(env.DB, ctx.organizationId);
					const key = normalizeForCargoKey(a.name);
					const exact = index.filter(
						(row) => normalizeForCargoKey(row.name) === key,
					);
					if (exact.length === 1 && exact[0]) {
						cargoId = exact[0].id;
					} else if (exact.length > 1) {
						return disambiguationOk(
							exact.map((row) => ({
								id: row.id,
								name: row.name,
								quantity: row.quantity,
								unit: row.unit,
							})),
							a.name,
						);
					} else {
						const results = await findSimilarCargoBatch(
							env,
							ctx.organizationId,
							[a.name],
							{ topK: 3, threshold: 0.6 },
						);
						const matches = results.get(a.name) ?? [];
						const top = matches[0];
						const runnerUp = matches[1];
						const ambiguous =
							top != null &&
							runnerUp != null &&
							top.score - runnerUp.score < QUICK_EAT_NAME_SCORE_GAP;
						if (ambiguous) {
							const rows = await getCargoByIds(
								env.DB,
								ctx.organizationId,
								matches.map((m) => m.itemId),
							);
							const scoreById = new Map(
								matches.map((m) => [m.itemId, m.score] as const),
							);
							return disambiguationOk(
								rows.map((row) => ({
									id: row.id,
									name: row.name,
									quantity: row.quantity,
									unit: row.unit,
									matchScore: scoreById.get(row.id) ?? 0,
								})),
								a.name,
							);
						}
						if (top) {
							cargoId = top.itemId;
						} else {
							const coerced = coerceToolUnit(a.unit ?? "unit");
							const ingest = await ingestCargoItems(
								env,
								ctx.organizationId,
								[
									{
										name: a.name,
										quantity: a.quantity,
										unit: coerced.unit,
										domain: "food",
										tags: [],
									},
								],
								{
									skipVectorPhase: true,
									waitUntil: ctx.waitUntil,
									userId: ctx.userId,
									flagContext,
								},
							);
							const result = ingest[0];
							const createdId = result?.item?.id;
							if (!createdId) {
								return err(
									"quick_eat_cargo",
									"internal_error",
									result?.error ?? "Could not create a Cargo line to eat.",
								);
							}
							cargoId = createdId;
							created = true;
						}
					}
				}

				if (!cargoId) {
					return err(
						"quick_eat_cargo",
						"not_found",
						"Could not resolve cargo item.",
					);
				}

				const existing = await getCargoItem(
					env.DB,
					ctx.organizationId,
					cargoId,
				);
				if (!existing) {
					return err(
						"quick_eat_cargo",
						"not_found",
						`Cargo item ${cargoId} not found.`,
						{
							recoveryHint:
								"Call list_inventory or search_ingredients, then retry with cargoId.",
						},
					);
				}

				const principal = nutritionPrincipal(ctx);
				try {
					const eaten = await quickEatFromCargo(
						env,
						ctx.organizationId,
						principal,
						flagContext,
						{
							cargoId,
							quantity: a.quantity,
							unit: a.unit,
							date: a.date ?? getUtcTodayISO(),
							operationKey: a.operationKey,
							logIntake: a.logIntake !== false,
							notes: a.notes,
							source: resolveAgentSurface(ctx),
						},
					);
					return ok(
						"quick_eat_cargo",
						{
							eaten: true,
							created,
							...eaten,
						},
						{
							outcome: "committed",
							requestId: principal.requestId,
						},
					);
				} catch (error) {
					if (error instanceof QuickEatNotFoundError) {
						return err("quick_eat_cargo", "not_found", error.message);
					}
					if (error instanceof QuickEatValidationError) {
						return err("quick_eat_cargo", "invalid_input", error.message);
					}
					throw error;
				}
			},
		}),
	];
}
