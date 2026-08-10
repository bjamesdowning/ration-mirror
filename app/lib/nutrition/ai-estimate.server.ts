import { z } from "zod";
import { callGemini } from "~/lib/ai-gateway.server";
import type { SupportedUnit } from "~/lib/units";
import {
	convertIngredientAmountToGrams,
	scaleNutrientsPer100g,
} from "./scale-nutrients";
import type { NutrientValues, NutritionSnapshot } from "./types";
import { atwaterKcalFromMacros } from "./usda-profile-quality";

export type AiEstimateOptions = {
	quantity?: number | null;
	unit?: SupportedUnit | null;
	/** Ingredient name for density-aware volume→grams (e.g. milk liters). */
	ingredientName?: string | null;
	/** Required for AI Gateway metadata when calling Gemini. */
	organizationId?: string;
	userId?: string;
};

const AiNutrientEstimateSchema = z.object({
	energyKcal: z.number().nonnegative().max(900),
	proteinG: z.number().nonnegative().max(100),
	fatG: z.number().nonnegative().max(100),
	carbG: z.number().nonnegative().max(100),
	fiberG: z.number().nonnegative().max(50).nullable().optional(),
	sugarG: z.number().nonnegative().max(100).nullable().optional(),
	satFatG: z.number().nonnegative().max(100).nullable().optional(),
	sodiumMg: z.number().nonnegative().max(10_000).nullable().optional(),
	saltG: z.number().nonnegative().max(50).nullable().optional(),
	confidence: z.number().min(0).max(1).optional(),
	description: z.string().max(200).optional(),
});

export type AiNutrientEstimate = z.infer<typeof AiNutrientEstimateSchema>;

/** Strip markdown fences and parse JSON object from model text. */
export function parseAiNutritionJson(text: string): unknown | null {
	const cleaned = text
		.replace(/^```(?:json)?\s*\n?/i, "")
		.replace(/\n?```\s*$/i, "")
		.trim();
	try {
		return JSON.parse(cleaned) as unknown;
	} catch {
		return null;
	}
}

/**
 * Atwater check: protein×4 + carbs×4 + fat×9 ≈ energy_kcal.
 * Returns 0–1 scale factor for confidence (1 = consistent).
 */
export function macroEnergyConsistency(values: {
	energyKcal: number;
	proteinG: number;
	fatG: number;
	carbG: number;
}): number {
	const expected = atwaterKcalFromMacros(values);
	if (!Number.isFinite(expected) || expected <= 0) {
		return values.energyKcal > 0 ? 0.4 : 0.5;
	}
	const ratio =
		Math.min(values.energyKcal, expected) /
		Math.max(values.energyKcal, expected);
	if (!Number.isFinite(ratio)) return 0.4;
	return Math.max(0, Math.min(1, ratio));
}

export function buildAiEstimateSnapshot(
	estimate: AiNutrientEstimate,
	opts?: AiEstimateOptions,
): NutritionSnapshot {
	const per100g: NutrientValues = {
		energyKcal: estimate.energyKcal,
		proteinG: estimate.proteinG,
		fatG: estimate.fatG,
		carbG: estimate.carbG,
		fiberG: estimate.fiberG ?? null,
		sugarG: estimate.sugarG ?? null,
		satFatG: estimate.satFatG ?? null,
		sodiumMg: estimate.sodiumMg ?? null,
		saltG: estimate.saltG ?? null,
	};

	const consistency = macroEnergyConsistency(per100g);
	const modelConfidence =
		typeof estimate.confidence === "number" ? estimate.confidence : 0.55;
	const confidence = Math.max(
		0,
		Math.min(1, Math.min(modelConfidence, consistency) * 0.95),
	);

	const grams =
		opts?.quantity != null && opts.unit
			? convertIngredientAmountToGrams(
					opts.quantity,
					opts.unit,
					opts.ingredientName,
				)
			: null;
	const perServing =
		grams != null ? scaleNutrientsPer100g(per100g, grams) : null;

	return {
		source: "ai_estimate",
		confidence,
		verified: false,
		per100g,
		perServing,
		fdcId: null,
		description: estimate.description?.trim() || null,
	};
}

/**
 * AI nutrient estimate via Gemini (AI Gateway).
 *
 * Call only when:
 *   - `nutrition-ai-estimate` is enabled, AND
 *   - caller is an AI ingest path (scan resolve / scan batch confirm), AND
 *   - USDA resolve already missed.
 *
 * Fail closed: returns null on config/parse/gateway errors.
 */
export async function estimateNutritionWithAi(
	env: Env,
	name: string,
	opts?: AiEstimateOptions,
): Promise<NutritionSnapshot | null> {
	const trimmed = name.trim();
	if (!trimmed) return null;

	const organizationId = opts?.organizationId?.trim() || "unknown";
	const userId = opts?.userId?.trim() || "unknown";

	const prompt = [
		"Estimate typical nutrition per 100 grams for this food item.",
		"Return ONLY a JSON object with keys:",
		"energyKcal, proteinG, fatG, carbG, fiberG, sugarG, satFatG, sodiumMg, saltG,",
		"confidence (0-1), description (short USDA-style name).",
		"Use null for unknown optional micronutrients. No markdown.",
		`Food: ${trimmed}`,
	].join("\n");

	const result = await callGemini(env, {
		feature: "nutrition_estimate",
		parts: [{ text: prompt }],
		metadata: { organizationId, userId },
	});

	if (!result.ok) return null;

	const raw = parseAiNutritionJson(result.text);
	if (raw == null) return null;

	const parsed = AiNutrientEstimateSchema.safeParse(raw);
	if (!parsed.success) return null;

	return buildAiEstimateSnapshot(parsed.data, {
		...opts,
		ingredientName: opts?.ingredientName ?? trimmed,
	});
}
