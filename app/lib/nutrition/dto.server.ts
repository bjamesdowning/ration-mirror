import type { NutritionSummary } from "~/lib/schemas/nutrition";
import type {
	FoodNutritionSnapshotV2,
	MealNutritionSnapshotV2,
	NutritionGoalDTO,
	NutritionIntakeDTO,
	NutritionSummaryV2,
	NutritionVsGoalDTO,
	PlannedDatesResponseV2,
} from "~/lib/schemas/nutrition-contract";
import {
	normalizeNutritionSnapshot,
	projectNutritionSnapshotToLegacy,
	toCanonicalNutrientAmounts,
} from "./adapters";
import {
	type NutrientGoalTargets,
	nutrientOverage,
	nutrientRemaining,
	nutrientTarget,
} from "./hub-widgets";
import type {
	NutritionIntakeRow,
	NutritionSummaryResult,
} from "./persist.server";
import type {
	AnyNutritionSnapshot,
	MealNutritionSnapshot,
	NutrientAttribution,
	NutritionSnapshotV2,
} from "./types";

export type NutritionSnapshotDto = ReturnType<
	typeof serializeNutritionSnapshot
>;
export type MealNutritionDto = ReturnType<typeof serializeMealNutrition>;
export type NutritionGoalDto = ReturnType<typeof serializeNutritionGoal>;
export type NutritionSummaryDto = ReturnType<typeof serializeNutritionSummary>;
export type NutritionIntakeDto = ReturnType<typeof serializeNutritionIntake>;

function vsGoalNutrient(
	consumed: number,
	target: number | null,
): NutritionVsGoalDTO["energyKcal"] {
	return {
		consumed,
		target,
		remaining: nutrientRemaining(consumed, target),
		overage: nutrientOverage(consumed, target),
	};
}

/** Remaining/overage vs personal targets. remaining/overage are null without a target. */
export function buildNutritionVsGoal(
	amounts: {
		energyKcal: number;
		proteinG: number;
		carbsG: number;
		fatG: number;
		fiberG?: number | null;
	},
	goal: NutrientGoalTargets | null,
): NutritionVsGoalDTO {
	const dto: NutritionVsGoalDTO = {
		energyKcal: vsGoalNutrient(
			amounts.energyKcal,
			nutrientTarget(goal, "energy"),
		),
		proteinG: vsGoalNutrient(amounts.proteinG, nutrientTarget(goal, "protein")),
		carbsG: vsGoalNutrient(amounts.carbsG, nutrientTarget(goal, "carbs")),
		fatG: vsGoalNutrient(amounts.fatG, nutrientTarget(goal, "fat")),
	};
	const fiberTarget = nutrientTarget(goal, "fiber");
	if (amounts.fiberG != null || fiberTarget != null) {
		dto.fiberG = vsGoalNutrient(amounts.fiberG ?? 0, fiberTarget);
	}
	return dto;
}

function toIso(value: Date | string | null | undefined): string | undefined {
	if (value == null) return undefined;
	if (value instanceof Date) return value.toISOString();
	return value;
}

/** Coerce D1/SQLite aggregate quirks (string numbers) to finite JSON numbers. */
export function coerceFiniteNumber(value: unknown, fallback = 0): number {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim() !== "") {
		const n = Number(value);
		if (Number.isFinite(n)) return n;
	}
	return fallback;
}

export function coerceOptionalFiniteNumber(
	value: unknown,
): number | null | undefined {
	if (value == null) return value === null ? null : undefined;
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim() !== "") {
		const n = Number(value);
		if (Number.isFinite(n)) return n;
	}
	return undefined;
}

/** Truncate to Int for mobile Codable fields (`orderIndex`, `servings`, counts). */
export function coerceFiniteInt(value: unknown, fallback = 0): number {
	return Math.trunc(coerceFiniteNumber(value, fallback));
}

export function coerceOptionalFiniteInt(value: unknown): number | null {
	if (value == null) return null;
	const n = coerceOptionalFiniteNumber(value);
	if (n == null || !Number.isFinite(n)) return null;
	return Math.trunc(n);
}

/** Always emit an ISO-8601 string for iOS date decoding (string-only strategy). */
export function toIsoDateString(value: Date | string | number): string {
	if (value instanceof Date) return value.toISOString();
	if (typeof value === "number" && Number.isFinite(value)) {
		// Drizzle timestamp mode may yield unix seconds or ms.
		const ms = value < 1e12 ? value * 1000 : value;
		return new Date(ms).toISOString();
	}
	const asDate = new Date(String(value));
	if (!Number.isNaN(asDate.getTime())) return asDate.toISOString();
	return String(value);
}

/** API-facing nutrition snapshot (v2 fields + legacy projection + additive nutritionV2). */
export function serializeNutritionSnapshot(snapshot: AnyNutritionSnapshot) {
	const v2 = normalizeNutritionSnapshot(snapshot);
	const legacy = projectNutritionSnapshotToLegacy(v2);
	const nutritionV2: FoodNutritionSnapshotV2 = {
		schemaVersion: 2,
		kind: "food",
		source: v2.source,
		confidence: v2.confidence,
		verified: v2.verified,
		sourceRef: v2.sourceRef,
		matchQuality: v2.matchQuality,
		servingBasis: v2.servingBasis,
		nutrientCoverage: v2.nutrientCoverage,
		per100g: toCanonicalNutrientAmounts(v2.per100g),
		perServing: toCanonicalNutrientAmounts(v2.perServing),
		fdcId: v2.fdcId,
		description: v2.description,
	};

	return {
		schemaVersion: v2.schemaVersion,
		source: v2.source,
		confidence: v2.confidence,
		verified: v2.verified,
		sourceRef: v2.sourceRef,
		matchQuality: v2.matchQuality,
		servingBasis: v2.servingBasis,
		nutrientCoverage: v2.nutrientCoverage,
		per100g: v2.per100g,
		perServing: v2.perServing,
		fdcId: v2.fdcId,
		description: v2.description,
		legacy,
		nutritionV2,
	} satisfies NutritionSnapshotV2 & {
		legacy: typeof legacy;
		nutritionV2: FoodNutritionSnapshotV2;
	};
}

export function serializeMealNutrition(snapshot: MealNutritionSnapshot) {
	const nutritionV2: MealNutritionSnapshotV2 = {
		schemaVersion: 2,
		kind: "meal",
		perServing: toCanonicalNutrientAmounts(snapshot.perServing) ?? {
			energyKcal: null,
			proteinG: null,
			carbsG: null,
			fatG: null,
			fiberG: null,
			sugarG: null,
			satFatG: null,
			sodiumMg: null,
			saltG: null,
		},
		coverage: snapshot.coverage,
		computedAt: snapshot.computedAt,
		attributions: snapshot.attributions.map((a: NutrientAttribution) => ({
			ingredientIndex: a.ingredientIndex,
			ingredientName: a.ingredientName,
			fdcId: a.fdcId,
			source: a.source,
			grams: a.grams,
			contribution:
				toCanonicalNutrientAmounts(a.contribution) ??
				({
					energyKcal: null,
					proteinG: null,
					carbsG: null,
					fatG: null,
					fiberG: null,
					sugarG: null,
					satFatG: null,
					sodiumMg: null,
					saltG: null,
				} as const),
		})),
	};

	return {
		perServing: snapshot.perServing,
		coverage: snapshot.coverage,
		attributions: snapshot.attributions.map((a: NutrientAttribution) => ({
			ingredientIndex: a.ingredientIndex,
			ingredientName: a.ingredientName,
			fdcId: a.fdcId,
			source: a.source,
			grams: a.grams,
			contribution: a.contribution,
		})),
		computedAt: snapshot.computedAt,
		nutritionV2,
	};
}

export function serializeNutritionGoal(
	goal: NonNullable<NutritionSummaryResult["goal"]> & {
		id?: string;
		consentAt?: Date | string | null;
		createdAt?: Date | string | null;
	},
): NutritionGoalDTO & {
	id?: string;
	consentAt?: string;
	createdAt?: string;
} {
	const dto: NutritionGoalDTO = {
		schemaVersion: 2,
		dailyEnergyKcal: goal.dailyEnergyKcal,
		proteinG: goal.proteinG,
		carbsG: goal.carbsG,
		fatG: goal.fatG,
		fiberG: goal.fiberG,
		effectiveFrom: goal.effectiveFrom,
		effectiveTo: goal.effectiveTo,
	};
	if (goal.id) dto.id = goal.id;
	const consentAt = toIso(goal.consentAt ?? undefined);
	const createdAt = toIso(goal.createdAt ?? undefined);
	if (consentAt) dto.consentAt = consentAt;
	if (createdAt) dto.createdAt = createdAt;
	return dto;
}

/** Legacy v1 summary shape plus additive v2 (`goalAsOf`, schemaVersion, vsGoal). */
export function serializeNutritionSummary(
	summary: NutritionSummaryResult,
): NutritionSummary & {
	goalAsOf: string;
	vsGoal: NutritionVsGoalDTO;
	nutritionV2: NutritionSummaryV2;
} {
	const goal = summary.goal ? serializeNutritionGoal(summary.goal) : null;
	const coercedDays = summary.days.map((day) => ({
		date: day.date,
		energyKcal: coerceFiniteNumber(day.energyKcal),
		proteinG: coerceFiniteNumber(day.proteinG),
		carbsG: coerceFiniteNumber(day.carbsG),
		fatG: coerceFiniteNumber(day.fatG),
		...(day.fiberG != null ? { fiberG: coerceFiniteNumber(day.fiberG) } : {}),
		coverageAvg: coerceFiniteNumber(day.coverageAvg),
		entryCount: Math.trunc(coerceFiniteNumber(day.entryCount)),
	}));
	const coercedTotals = {
		energyKcal: coerceFiniteNumber(summary.totals.energyKcal),
		proteinG: coerceFiniteNumber(summary.totals.proteinG),
		carbsG: coerceFiniteNumber(summary.totals.carbsG),
		fatG: coerceFiniteNumber(summary.totals.fatG),
		...(summary.totals.fiberG != null
			? { fiberG: coerceFiniteNumber(summary.totals.fiberG) }
			: {}),
	};
	const lastDay = coercedDays.find((day) => day.date === summary.to) ?? {
		date: summary.to,
		energyKcal: 0,
		proteinG: 0,
		carbsG: 0,
		fatG: 0,
		coverageAvg: 0,
		entryCount: 0,
	};
	const vsGoal = buildNutritionVsGoal(lastDay, goal);
	const days = coercedDays.map((day) => ({
		schemaVersion: 2 as const,
		...day,
		vsGoal: buildNutritionVsGoal(day, goal),
	}));
	const nutritionV2: NutritionSummaryV2 = {
		schemaVersion: 2,
		from: summary.from,
		to: summary.to,
		goalAsOf: summary.to,
		totals: coercedTotals,
		days,
		goal,
		vsGoal,
	};
	return {
		from: summary.from,
		to: summary.to,
		goalAsOf: summary.to,
		totals: coercedTotals,
		days: coercedDays,
		goal: summary.goal
			? {
					dailyEnergyKcal:
						coerceOptionalFiniteNumber(summary.goal.dailyEnergyKcal) ?? null,
					proteinG: coerceOptionalFiniteNumber(summary.goal.proteinG) ?? null,
					carbsG: coerceOptionalFiniteNumber(summary.goal.carbsG) ?? null,
					fatG: coerceOptionalFiniteNumber(summary.goal.fatG) ?? null,
					fiberG: coerceOptionalFiniteNumber(summary.goal.fiberG) ?? null,
					effectiveFrom: summary.goal.effectiveFrom,
					effectiveTo: summary.goal.effectiveTo,
				}
			: null,
		vsGoal,
		nutritionV2,
	};
}

export function serializeNutritionIntake(
	row: NutritionIntakeRow,
): NutritionIntakeDTO {
	return {
		schemaVersion: 2,
		id: row.id,
		manifestDate: row.manifestDate,
		slotType: row.slotType,
		servings: row.servings,
		energyKcal: row.energyKcal,
		proteinG: row.proteinG,
		carbsG: row.carbsG,
		fatG: row.fatG,
		mealId: row.mealId,
		mealName: row.mealName,
		organizationId: row.organizationId,
		organizationName: row.organizationName,
		verified: row.verified === 1,
		occurredAt: toIsoDateString(row.occurredAt),
		notes: row.notes ?? null,
	};
}

export function serializeNutritionIntakeList(
	items: NutritionIntakeRow[],
	nextCursor: string | null,
) {
	return {
		items: items.map(serializeNutritionIntake),
		nextCursor,
	};
}

export function serializePlannedDatesResponse(input: {
	from: string;
	to: string;
	dates: string[];
	consumedDates?: string[];
}): PlannedDatesResponseV2 & { dates: string[]; consumedDates?: string[] } {
	return {
		schemaVersion: 2,
		from: input.from,
		to: input.to,
		dates: input.dates,
		...(input.consumedDates ? { consumedDates: input.consumedDates } : {}),
	};
}
