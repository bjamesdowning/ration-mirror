import type { SupportedUnit } from "~/lib/units";
import { upgradeNutritionSnapshotToV2 } from "./adapters";
import { estimateNutritionWithAi } from "./ai-estimate.server";
import { resolveFdcPortionGrams } from "./fdc-portion.server";
import { resolveIngredientMass } from "./mass-resolution";
import { resolveFoodName } from "./resolve-food.server";
import {
	projectNullableValuesToLegacy,
	scaleNullableNutrientValues,
} from "./scale-nutrients";
import type { NutritionSnapshot, NutritionSnapshotV2 } from "./types";

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
 * Returns a NutritionSnapshot or null when unresolved.
 * Automated USDA name matches are never marked `verified` (user/barcode only).
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
	if (resolved) {
		let fdcPortionGrams: number | null = null;
		let fdcPortionConfidence = 0;

		if (resolved.fdcId != null && opts?.quantity != null && opts.unit) {
			const portion = await resolveFdcPortionGrams(
				env,
				resolved.fdcId,
				opts.quantity,
				opts.unit,
			);
			fdcPortionGrams = portion.grams;
			fdcPortionConfidence = portion.confidence;
		}

		const mass = resolveIngredientMass(
			opts?.quantity,
			opts?.unit ?? null,
			name,
			{
				forNutrition: true,
				fdcPortionGrams,
				fdcPortionConfidence,
			},
		);

		const perServingNullable =
			mass.grams != null
				? scaleNullableNutrientValues(
						resolved.nutrientsPer100g,
						mass.grams / 100,
					)
				: null;

		return {
			source: "usda",
			confidence: resolved.autoAccept ? 0.95 : 0.7,
			// Automated USDA name matches are never verified (user/barcode only).
			verified: false,
			per100g: projectNullableValuesToLegacy(resolved.nutrientsPer100g),
			perServing: perServingNullable
				? projectNullableValuesToLegacy(perServingNullable)
				: null,
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
	if (!resolved) {
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

	let portionId: number | null = null;
	let portionDescription: string | null = null;
	let fdcPortionGrams: number | null = null;
	let fdcPortionConfidence = 0;

	if (resolved.fdcId != null && opts?.quantity != null && opts.unit) {
		const portion = await resolveFdcPortionGrams(
			env,
			resolved.fdcId,
			opts.quantity,
			opts.unit,
		);
		fdcPortionGrams = portion.grams;
		fdcPortionConfidence = portion.confidence;
		portionId = portion.portion?.id ?? null;
		portionDescription =
			portion.portion?.portionDescription ??
			portion.portion?.measureUnit ??
			null;
	}

	const mass = resolveIngredientMass(opts?.quantity, opts?.unit ?? null, name, {
		forNutrition: true,
		fdcPortionGrams,
		fdcPortionConfidence,
	});

	const perServingNullable =
		mass.grams != null
			? scaleNullableNutrientValues(resolved.nutrientsPer100g, mass.grams / 100)
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
			grams: mass.grams,
			method: mass.method,
			confidence: mass.confidence,
			portionId,
			portionDescription,
		},
	};
}
