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
import { normalizeForCargoKey } from "../../cargo-utils";
import { isFeatureEnabled } from "../../feature-flags/flags.server";
import { isPlanFuelActionsEnabled } from "../../nutrition/fast-log-flag.server";
import {
	FuelDailyLimitError,
	FuelTimezoneRequiredError,
} from "../../nutrition/fuel-errors";
import { kitchenTodayForOrganization } from "../../org-supply-settings.server";
import { addCargoToFuel } from "../../plan-fuel-actions.server";
import { IntakeNotesSchema } from "../../schemas/manifest";
import { UuidSchema } from "../../schemas/uuid";
import { coerceToolUnit, convertQuantity, toSupportedUnit } from "../../units";
import { findSimilarCargoBatch } from "../../vector.server";
import {
	resolveAgentFlagContext,
	resolveAgentSurface,
} from "../agent-flag-context";
import type { McpToolContext } from "../auth";
import { err, featureDisabled, ok, type ToolEnvelope } from "../envelope";
import {
	decideStockNameMatch,
	NAME_SEARCH_RECALL_THRESHOLD,
	type NameMatchDisambiguationReason,
	STOCK_NAME_MATCH_THRESHOLD,
	stockNameDisambiguationNote,
} from "../name-match";
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
	  } & QuickEatResult)
	| {
			eaten: true;
			created: boolean;
			intakeId: string;
			deducted: number;
	  };

function fuelActionError(error: unknown): ToolEnvelope<never> | null {
	if (error instanceof FuelTimezoneRequiredError) {
		return err("quick_eat_cargo", "invalid_input", error.message, {
			recoveryHint:
				"Set a time zone on Fuel, then retry the same operationKey.",
		});
	}
	if (error instanceof FuelDailyLimitError) {
		return err("quick_eat_cargo", "conflict", error.message, {
			recoveryHint:
				"The free daily Fuel limit is reached. Retry tomorrow, or use a Crew account.",
		});
	}
	if (
		error !== null &&
		typeof error === "object" &&
		"type" in error &&
		(error as { type: string }).type === "DataWithResponseInit"
	) {
		const payload = (error as { data?: unknown }).data;
		const status = (error as { init?: { status?: number } }).init?.status;
		const message =
			payload &&
			typeof payload === "object" &&
			"error" in payload &&
			typeof (payload as { error: unknown }).error === "string"
				? (payload as { error: string }).error
				: "Could not log Fuel.";
		if (status === 404) {
			return err("quick_eat_cargo", "not_found", message, {
				recoveryHint:
					"Call list_inventory and retry with a cargoId that is still in Cargo.",
			});
		}
		if (status === 409) {
			return err("quick_eat_cargo", "conflict", message, {
				recoveryHint:
					"That amount is not in Cargo. Lower the quantity and retry the same operationKey.",
			});
		}
		if (status === 403) {
			return featureDisabled("quick_eat_cargo", message);
		}
		return err("quick_eat_cargo", "invalid_input", message);
	}
	return null;
}

function disambiguationOk(
	candidates: QuickEatCandidate[],
	query: string,
	reason: NameMatchDisambiguationReason = "close_scores",
) {
	return ok("quick_eat_cargo", {
		eaten: false as const,
		requiresDisambiguation: true as const,
		candidates,
		note: stockNameDisambiguationNote(
			query,
			reason,
			"retry quick_eat_cargo with that cargoId",
		),
	});
}

export function createQuickEatToolDefs(env: McpToolsEnv) {
	return [
		defineSharedTool({
			name: "quick_eat_cargo",
			description: `Log that the caller personally ate a pantry item. Resolves by cargoId or exact name. A semantic match is used only at or above the cook threshold (${STOCK_NAME_MATCH_THRESHOLD}); a weaker hit returns candidates and does not eat or create a line. If no pantry line matches, creates one for the eaten amount then deducts it (net 0, line kept as a restock reminder). When plan-fuel-actions is on, deducts that quantity once and logs Fuel. It does not create a provision or a Manifest snack. When that flag is off, Quick Eat places a Manifest snack and optionally logs private intake. Use for 'I ate / just ate / had a snack of X'. Do not use adjust_cargo_item for personal eating. stockWasShort applies to Quick Eat when they ate more than stock. Flag off requires cargo-quick-eat + nutrition-cook-log-split. Not medical advice.`,
			inputSchema: z.object({
				cargoId: UuidSchema.optional(),
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
					.describe(
						"Calendar date (defaults to the kitchen's local today, or today UTC when no zone is stored)",
					),
				operationKey: UuidSchema,
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
				const fuelActionsOn = await isPlanFuelActionsEnabled(env, flagContext);
				if (!fuelActionsOn) {
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
							{ topK: 3, threshold: NAME_SEARCH_RECALL_THRESHOLD },
						);
						const matches = results.get(a.name) ?? [];
						const decision = decideStockNameMatch(
							matches,
							QUICK_EAT_NAME_SCORE_GAP,
						);
						if (decision.kind === "disambiguate") {
							const rows = await getCargoByIds(
								env.DB,
								ctx.organizationId,
								decision.matches.map((match) => match.itemId),
							);
							if (rows.length > 0) {
								const scoreById = new Map(
									decision.matches.map(
										(match) => [match.itemId, match.score] as const,
									),
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
									decision.reason,
								);
							}
						} else if (decision.kind === "use") {
							cargoId = decision.itemId;
						}
						if (!cargoId) {
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
					if (fuelActionsOn) {
						const from = coerceToolUnit(a.unit ?? existing.unit).unit;
						const to = toSupportedUnit(existing.unit);
						const quantity = convertQuantity(a.quantity, from, to);
						if (quantity == null || !(quantity > 0)) {
							return err(
								"quick_eat_cargo",
								"invalid_input",
								"Unit does not match this cargo item.",
								{
									recoveryHint:
										"Use the cargo line's unit, or a unit in the same family, and retry the same operationKey.",
								},
							);
						}
						const logged = await addCargoToFuel(
							env,
							ctx.organizationId,
							cargoId,
							quantity,
							principal,
							flagContext,
							{
								operationKey: a.operationKey,
								idempotencyKey: a.operationKey,
								occurredAt: new Date().toISOString(),
							},
						);
						return ok(
							"quick_eat_cargo",
							{
								eaten: true,
								created,
								intakeId: logged.intakeId,
								deducted: logged.deducted,
							},
							{
								outcome: "committed",
								requestId: principal.requestId,
							},
						);
					}
					const eaten = await quickEatFromCargo(
						env,
						ctx.organizationId,
						principal,
						flagContext,
						{
							cargoId,
							quantity: a.quantity,
							unit: a.unit,
							date:
								a.date ??
								(await kitchenTodayForOrganization(env.DB, ctx.organizationId)),
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
					const mapped = fuelActionError(error);
					if (mapped) return mapped;
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
