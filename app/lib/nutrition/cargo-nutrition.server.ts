import type { SupportedUnit } from "~/lib/units";
import { upgradeNutritionSnapshotToV2 } from "./adapters";
import { estimateNutritionWithAi } from "./ai-estimate.server";
import { resolveHouseholdServingGrams } from "./fdc-portion.server";
import { resolveFoodName } from "./resolve-food.server";
import {
	projectNullableValuesToLegacy,
	scaleNullableNutrientValues,
} from "./scale-nutrients";
import type { NutritionSnapshot, NutritionSnapshotV2 } from "./types";
import { isUsdaNutrientProfileUsable } from "./usda-profile-quality";

export type ResolveCargoNutritionOptions = {
	quantity?: number | null;
	unit?: SupportedUnit | null;
	/**
	 * When true (caller already checked nutrition-ai-estimate), attempt AI fill
	 * on USDA miss. Default false — manual/CSV/API paths must never AI-estimate.
	 */
	allowAiEstimate?: boolean;
	organizationId?: string;
	userId?: string;
};

/**
 * Resolve nutrition for a cargo item name against USDA seed DB.
 * Cargo stores **density** (`per100g`) as authoritative; `perServing` is an
 * optional household portion (cup/serving), never the cargo package total.
 * Automated USDA name matches are never marked `verified` (user/barcode only).
 *
 * Incomplete or Atwater-inconsistent USDA energy profiles are treated as misses
 * so scan review can fall through to AI estimate when allowed.
 */
export async function resolveAndBuildCargoNutrition(
	env: Env,
	name: string,
	opts?: ResolveCargoNutritionOptions,
): Promise<NutritionSnapshot | null> {
	const resolved = await resolveFoodName(env, name, {
		organizationId: opts?.organizationId,
		userId: opts?.userId,
	});
	if (resolved && isUsdaNutrientProfileUsable(resolved.nutrientsPer100g)) {
		let householdPerServing = null;
		if (resolved.fdcId != null) {
			const household = await resolveHouseholdServingGrams(env, resolved.fdcId);
			if (household.grams != null && household.grams > 0) {
				householdPerServing = projectNullableValuesToLegacy(
					scaleNullableNutrientValues(
						resolved.nutrientsPer100g,
						household.grams / 100,
					),
				);
			}
		}

		return {
			source: "usda",
			confidence: resolved.autoAccept ? 0.95 : 0.7,
			verified: false,
			per100g: projectNullableValuesToLegacy(resolved.nutrientsPer100g),
			perServing: householdPerServing,
			fdcId: resolved.fdcId,
			description: resolved.description,
		};
	}

	if (opts?.allowAiEstimate) {
		return estimateNutritionWithAi(env, name, {
			quantity: opts.quantity,
			unit: opts.unit,
			organizationId: opts.organizationId,
			userId: opts.userId,
		});
	}

	return null;
}

/** Same as {@link resolveAndBuildCargoNutrition} with v2 provenance / match / mass. */
export async function resolveAndBuildCargoNutritionV2(
	env: Env,
	name: string,
	opts?: ResolveCargoNutritionOptions,
): Promise<NutritionSnapshotV2 | null> {
	const resolved = await resolveFoodName(env, name, {
		organizationId: opts?.organizationId,
		userId: opts?.userId,
	});
	if (!resolved || !isUsdaNutrientProfileUsable(resolved.nutrientsPer100g)) {
		const legacy = opts?.allowAiEstimate
			? await estimateNutritionWithAi(env, name, {
					quantity: opts.quantity,
					unit: opts.unit,
					organizationId: opts.organizationId,
					userId: opts.userId,
				})
			: null;
		return legacy ? upgradeNutritionSnapshotToV2(legacy) : null;
	}

	let householdGrams: number | null = null;
	let portionId: number | null = null;
	let portionDescription: string | null = null;
	if (resolved.fdcId != null) {
		const household = await resolveHouseholdServingGrams(env, resolved.fdcId);
		householdGrams = household.grams;
		portionId = household.portion?.id ?? null;
		portionDescription =
			household.portion?.portionDescription ??
			household.portion?.measureUnit ??
			null;
	}

	const perServingNullable =
		householdGrams != null && householdGrams > 0
			? scaleNullableNutrientValues(
					resolved.nutrientsPer100g,
					householdGrams / 100,
				)
			: null;

	const legacy: NutritionSnapshot = {
		source: "usda",
		confidence: resolved.autoAccept ? 0.95 : 0.7,
		verified: false,
		per100g: projectNullableValuesToLegacy(resolved.nutrientsPer100g),
		perServing: perServingNullable
			? projectNullableValuesToLegacy(perServingNullable)
			: null,
		fdcId: resolved.fdcId,
		description: resolved.description,
	};

	const v2 = upgradeNutritionSnapshotToV2(legacy);
	return {
		...v2,
		per100g: resolved.nutrientsPer100g,
		perServing: perServingNullable,
		matchQuality: resolved.matchQuality ?? "high",
		verified: false,
		provenance: resolved.provenance ?? null,
		match: resolved.match ?? null,
		mass: {
			grams: householdGrams,
			method: householdGrams != null ? "fdc_portion" : "unknown",
			confidence: householdGrams != null ? 0.85 : 0,
			portionId,
			portionDescription,
		},
	};
}
