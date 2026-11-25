/**
 * Compact MCP-only result shapes (#15, #19). Shared services keep their full
 * return values for the web and mobile routes; these helpers trim or extend
 * what an agent gets back from the MCP and Copilot tool layer only.
 */

import type { NutritionSummaryDto } from "../nutrition/dto.server";
import type { LogManifestIntakesResult } from "../nutrition/service.server";
import type { NutritionVsGoalDTO } from "../schemas/nutrition-contract";

export type NutritionSummaryWithDayGoals = Omit<NutritionSummaryDto, "days"> & {
	days: Array<
		NutritionSummaryDto["days"][number] & { vsGoal: NutritionVsGoalDTO | null }
	>;
};

/**
 * Copy each day's remaining/overage onto the top-level `days` rows. The agent
 * profile drops `nutritionV2`, which is the only place per-day `vsGoal` lived.
 * The shared serializer is left alone so mobile and web responses do not move.
 */
export function withPerDayVsGoal(
	summary: NutritionSummaryDto,
): NutritionSummaryWithDayGoals {
	const byDate = new Map<string, NutritionVsGoalDTO | undefined>(
		summary.nutritionV2.days.map((day) => [day.date, day.vsGoal]),
	);
	return {
		...summary,
		days: summary.days.map((day) => ({
			...day,
			vsGoal: byDate.get(day.date) ?? null,
		})),
	};
}

export type CompactManifestIntakeItem = {
	intakeId: string;
	entryId: string | null;
	replacedIntakeId: string | null;
	replayed: boolean;
	mealName: string | null;
	date: string | null;
	slot: string | null;
	servings: number | null;
	amount: number | null;
	unit: string;
	energyKcal: number | null;
	proteinG: number | null;
	carbsG: number | null;
	fatG: number | null;
	fiberG: number | null;
	notes?: string;
};

export type CompactManifestIntakeResult = {
	logged: number;
	operationId: string;
	replayed: boolean;
	undoExpiresAt: Date | null;
	summaryGeneratedAt: string;
	items: CompactManifestIntakeItem[];
	dayTotals: LogManifestIntakesResult["dayTotals"];
};

function numberOrNull(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * log_manifest_intake reply: one line per plate-up instead of the raw
 * nutrition_intake row (which carries user, kitchen, consent, and Health ids
 * plus nutrient JSON bags an agent never needs).
 */
export function compactManifestIntakeResult(
	result: LogManifestIntakesResult,
): CompactManifestIntakeResult {
	return {
		logged: result.items.length,
		operationId: result.operationId,
		replayed: result.replayed,
		undoExpiresAt: result.undoExpiresAt,
		summaryGeneratedAt: result.summaryGeneratedAt,
		items: result.items.map(({ intake, replacedIntakeId, replayed }) => {
			const servings = numberOrNull(intake.servings);
			const loggedUnit = stringOrNull(intake.loggedUnit);
			const notes = stringOrNull(intake.notes);
			return {
				intakeId: intake.id,
				entryId: stringOrNull(intake.entryId),
				replacedIntakeId: replacedIntakeId ?? null,
				replayed,
				mealName: stringOrNull(intake.mealNameSnapshot),
				date:
					stringOrNull(intake.fuelDate) ?? stringOrNull(intake.manifestDate),
				slot: stringOrNull(intake.slotType),
				servings,
				amount: loggedUnit ? numberOrNull(intake.loggedAmount) : servings,
				unit: loggedUnit ?? "serving",
				energyKcal: numberOrNull(intake.energyKcal),
				proteinG: numberOrNull(intake.proteinG),
				carbsG: numberOrNull(intake.carbsG),
				fatG: numberOrNull(intake.fatG),
				fiberG: numberOrNull(intake.fiberG),
				...(notes ? { notes } : {}),
			};
		}),
		dayTotals: result.dayTotals,
	};
}
