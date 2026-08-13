/**
 * Mobile (and shared) Manifest entry wire serialization.
 * Coerces D1 quirks so iOS Int/Double/Date Codable does not fail the whole week.
 */

import type { MealPlanEntryWithMeal } from "~/lib/manifest.server";
import {
	coerceFiniteInt,
	coerceFiniteNumber,
	coerceOptionalFiniteInt,
	coerceOptionalFiniteNumber,
	toIsoDateString,
} from "~/lib/nutrition/dto.server";

export type ManifestEntryWire = Omit<
	MealPlanEntryWithMeal,
	| "consumedAt"
	| "cookedAt"
	| "createdAt"
	| "personalIntake"
	| "orderIndex"
	| "servingsOverride"
	| "mealServings"
	| "mealPrepTime"
	| "mealCookTime"
	| "mealEnergyKcalPerServing"
	| "mealProteinGPerServing"
	| "mealCarbsGPerServing"
	| "mealFatGPerServing"
	| "gramsPerServing"
> & {
	orderIndex: number;
	servingsOverride: number | null;
	consumedAt: string | null;
	cookedAt: string | null;
	createdAt: string;
	mealServings: number;
	mealPrepTime: number | null;
	mealCookTime: number | null;
	mealEnergyKcalPerServing: number | null;
	mealProteinGPerServing: number | null;
	mealCarbsGPerServing: number | null;
	mealFatGPerServing: number | null;
	gramsPerServing: number | null;
	personalIntake?: {
		id: string;
		servings: number;
		energyKcal: number;
		proteinG: number;
		carbsG: number;
		fatG: number;
		occurredAt: string;
		notes?: string | null;
		loggedAmount?: number | null;
		loggedUnit?: "serving" | "g" | "oz" | null;
	} | null;
};

function serializePersonalIntake(
	intake: NonNullable<MealPlanEntryWithMeal["personalIntake"]>,
): NonNullable<ManifestEntryWire["personalIntake"]> {
	return {
		id: intake.id,
		servings: coerceFiniteNumber(intake.servings),
		energyKcal: coerceFiniteNumber(intake.energyKcal),
		proteinG: coerceFiniteNumber(intake.proteinG),
		carbsG: coerceFiniteNumber(intake.carbsG),
		fatG: coerceFiniteNumber(intake.fatG),
		occurredAt: toIsoDateString(intake.occurredAt),
		notes: intake.notes ?? null,
		loggedAmount:
			intake.loggedAmount != null
				? coerceFiniteNumber(intake.loggedAmount)
				: null,
		loggedUnit: intake.loggedUnit ?? null,
	};
}

/** Serialize one Manifest entry for mobile/web JSON boundaries. */
export function serializeManifestEntryForWire(
	entry: MealPlanEntryWithMeal,
): ManifestEntryWire {
	const energy =
		coerceOptionalFiniteNumber(entry.mealEnergyKcalPerServing) ?? null;
	const protein =
		coerceOptionalFiniteNumber(entry.mealProteinGPerServing) ?? null;
	const carbs = coerceOptionalFiniteNumber(entry.mealCarbsGPerServing) ?? null;
	const fat = coerceOptionalFiniteNumber(entry.mealFatGPerServing) ?? null;

	return {
		id: entry.id,
		planId: entry.planId,
		mealId: entry.mealId,
		date: entry.date,
		slotType: entry.slotType,
		orderIndex: coerceFiniteInt(entry.orderIndex),
		servingsOverride: coerceOptionalFiniteInt(entry.servingsOverride),
		notes: entry.notes,
		consumedAt:
			entry.consumedAt == null ? null : toIsoDateString(entry.consumedAt),
		cookedAt: entry.cookedAt == null ? null : toIsoDateString(entry.cookedAt),
		createdAt: toIsoDateString(entry.createdAt),
		mealName: entry.mealName,
		mealServings: coerceFiniteInt(entry.mealServings, 1),
		mealType: entry.mealType,
		mealPrepTime: coerceOptionalFiniteInt(entry.mealPrepTime),
		mealCookTime: coerceOptionalFiniteInt(entry.mealCookTime),
		...(entry.mealTags !== undefined ? { mealTags: entry.mealTags } : {}),
		mealEnergyKcalPerServing: energy,
		mealProteinGPerServing: protein,
		mealCarbsGPerServing: carbs,
		mealFatGPerServing: fat,
		gramsPerServing: coerceOptionalFiniteNumber(entry.gramsPerServing) ?? null,
		...(entry.personalIntake !== undefined
			? {
					personalIntake: entry.personalIntake
						? serializePersonalIntake(entry.personalIntake)
						: null,
				}
			: {}),
	};
}

export function serializeManifestEntriesForWire(
	entries: MealPlanEntryWithMeal[],
): ManifestEntryWire[] {
	return entries.map(serializeManifestEntryForWire);
}
