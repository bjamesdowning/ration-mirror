/**
 * Private Manifest Eat — user-scoped personal intake upsert/clear.
 * Never mutates Cargo, meal-plan preparation state, or shared kitchen events.
 * Gated by nutrition-cook-log-split + nutrition-manifest + intake consent.
 */

import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { meal, mealPlan, mealPlanEntry, nutritionIntake } from "~/db/schema";
import { assertFeatureEnabled } from "~/lib/feature-flags/assert-enabled.server";
import type { FlagshipEvaluationContext } from "~/lib/feature-flags/context.server";
import {
	assertNutritionConsent,
	grantNutritionConsent,
	NutritionConsentRequiredError,
	type NutritionConsentSource,
} from "~/lib/nutrition/consent.server";
import { NUTRITION_COVERAGE_THRESHOLD } from "~/lib/nutrition/constants";
import {
	getActivePersonalIntakeForEntry,
	type PersonalIntakeSummary,
	replaceActivePersonalIntake,
	voidActivePersonalIntake,
} from "~/lib/nutrition/persist.server";
import {
	scaleNutrientValues,
	toNullableNutrientValues,
} from "~/lib/nutrition/scale-nutrients";
import type { MealNutritionSnapshot } from "~/lib/nutrition/types";

export class NutritionUnavailableError extends Error {
	readonly code = "nutrition_unavailable" as const;
	constructor(message = "Meal nutrition is unavailable for this entry") {
		super(message);
		this.name = "NutritionUnavailableError";
	}
}

export class ManifestEntryNotPreparedError extends Error {
	readonly code = "entry_not_prepared" as const;
	constructor(message = "Entry must be cooked before logging a serving") {
		super(message);
		this.name = "ManifestEntryNotPreparedError";
	}
}

export type ManifestIntakeSummary = {
	id: string;
	entryId: string;
	servings: number;
	energyKcal: number;
	proteinG: number;
	carbsG: number;
	fatG: number;
	occurredAt: Date;
};

export type UpsertManifestPersonalIntakeResult = {
	intake: ManifestIntakeSummary;
	idempotent: boolean;
	replaced: boolean;
	/** Prior active intake id voided by this edit (for undo restore). */
	replacedIntakeId: string | null;
};

export type ClearManifestPersonalIntakeResult = {
	cleared: boolean;
	voidedIntakeId: string | null;
};

function toSummary(
	row:
		| PersonalIntakeSummary
		| {
				id: string;
				entryId: string | null;
				servings: number;
				energyKcal: number;
				proteinG: number;
				carbsG: number;
				fatG: number;
				occurredAt: Date;
		  },
): ManifestIntakeSummary {
	if (!row.entryId) {
		throw new Error("Intake row missing entryId");
	}
	return {
		id: row.id,
		entryId: row.entryId,
		servings: row.servings,
		energyKcal: row.energyKcal,
		proteinG: row.proteinG,
		carbsG: row.carbsG,
		fatG: row.fatG,
		occurredAt: row.occurredAt,
	};
}

/**
 * Upsert the caller's one active personal intake for a prepared Manifest entry.
 */
export async function upsertManifestPersonalIntake(
	env: Env,
	input: {
		organizationId: string;
		userId: string;
		planId: string;
		entryId: string;
		servings: number;
		idempotencyKey: string;
		operationId?: string;
		/** When true on first request, server-stamps purpose:"intake" consent. */
		consent?: boolean;
		consentSource?: NutritionConsentSource;
		occurredAt?: Date;
		/**
		 * Full Flagship context from the route (includes clientPlatform/clientVersion).
		 * Callers with a Request must pass buildFlagContext(...); do not omit.
		 */
		flagContext: FlagshipEvaluationContext;
	},
): Promise<UpsertManifestPersonalIntakeResult> {
	await assertFeatureEnabled(
		env,
		"nutrition-cook-log-split",
		input.flagContext,
	);
	await assertFeatureEnabled(env, "nutrition-manifest", input.flagContext);

	try {
		await assertNutritionConsent(env.DB, input.userId, "intake");
	} catch (e) {
		if (!(e instanceof NutritionConsentRequiredError)) throw e;
		if (input.consent === true) {
			await grantNutritionConsent(env.DB, {
				userId: input.userId,
				purpose: "intake",
				source: input.consentSource ?? "web",
			});
		} else {
			throw e;
		}
	}

	const d1 = drizzle(env.DB);

	const [plan] = await d1
		.select({ id: mealPlan.id })
		.from(mealPlan)
		.where(
			and(
				eq(mealPlan.id, input.planId),
				eq(mealPlan.organizationId, input.organizationId),
			),
		)
		.limit(1);
	if (!plan) throw new Error("Meal plan not found or unauthorized");

	const [entry] = await d1
		.select({
			id: mealPlanEntry.id,
			mealId: mealPlanEntry.mealId,
			date: mealPlanEntry.date,
			slotType: mealPlanEntry.slotType,
			cookedAt: mealPlanEntry.cookedAt,
			consumedAt: mealPlanEntry.consumedAt,
			mealNutrition: meal.nutrition,
		})
		.from(mealPlanEntry)
		.innerJoin(meal, eq(mealPlanEntry.mealId, meal.id))
		.where(
			and(
				eq(mealPlanEntry.id, input.entryId),
				eq(mealPlanEntry.planId, input.planId),
				eq(meal.organizationId, input.organizationId),
			),
		)
		.limit(1);

	if (!entry) throw new Error("Manifest entry not found or unauthorized");
	if (entry.cookedAt == null && entry.consumedAt == null) {
		throw new ManifestEntryNotPreparedError();
	}

	const [byKey] = await d1
		.select()
		.from(nutritionIntake)
		.where(
			and(
				eq(nutritionIntake.userId, input.userId),
				eq(nutritionIntake.idempotencyKey, input.idempotencyKey),
			),
		)
		.limit(1);

	if (byKey && byKey.entryId === input.entryId) {
		return {
			intake: toSummary(byKey),
			idempotent: true,
			replaced: false,
			replacedIntakeId: byKey.replacesIntakeId,
		};
	}

	const snap = entry.mealNutrition as MealNutritionSnapshot | null;
	const perServing = snap?.perServing;
	if (
		!perServing ||
		perServing.energyKcal == null ||
		!Number.isFinite(perServing.energyKcal)
	) {
		throw new NutritionUnavailableError();
	}

	const scaled = scaleNutrientValues(perServing, input.servings);
	const coverage = snap?.coverage ?? 0;
	const verified: 0 | 1 = coverage >= NUTRITION_COVERAGE_THRESHOLD ? 1 : 0;
	const now = input.occurredAt ?? new Date();
	const nutrientsJson = toNullableNutrientValues(scaled) as unknown as Record<
		string,
		number | null
	>;

	const { row, replacedId } = await replaceActivePersonalIntake(env.DB, {
		organizationId: input.organizationId,
		userId: input.userId,
		planId: input.planId,
		entryId: input.entryId,
		mealId: entry.mealId,
		manifestDate: entry.date,
		slotType: entry.slotType ?? null,
		servings: input.servings,
		energyKcal: scaled.energyKcal,
		proteinG: scaled.proteinG,
		carbsG: scaled.carbG,
		fatG: scaled.fatG,
		coverage,
		source: "meal",
		confidence: coverage,
		verified,
		occurredAt: now,
		kitchenEventId: null,
		schemaVersion: 2,
		nutrientsJson,
		coverageJson: { overall: coverage },
		idempotencyKey: input.idempotencyKey,
		operationId: input.operationId ?? null,
	});

	return {
		intake: toSummary(row),
		idempotent: false,
		replaced: replacedId != null,
		replacedIntakeId: replacedId,
	};
}

/**
 * Soft-void the caller's active personal intake ("Remove my log").
 */
export async function clearManifestPersonalIntake(
	env: Env,
	input: {
		organizationId: string;
		userId: string;
		planId: string;
		entryId: string;
		/** Full Flagship context from the route (includes clientPlatform/clientVersion). */
		flagContext: FlagshipEvaluationContext;
	},
): Promise<ClearManifestPersonalIntakeResult> {
	await assertFeatureEnabled(
		env,
		"nutrition-cook-log-split",
		input.flagContext,
	);
	await assertFeatureEnabled(env, "nutrition-manifest", input.flagContext);

	const d1 = drizzle(env.DB);
	const [plan] = await d1
		.select({ id: mealPlan.id })
		.from(mealPlan)
		.where(
			and(
				eq(mealPlan.id, input.planId),
				eq(mealPlan.organizationId, input.organizationId),
			),
		)
		.limit(1);
	if (!plan) throw new Error("Meal plan not found or unauthorized");

	const [entry] = await d1
		.select({ id: mealPlanEntry.id })
		.from(mealPlanEntry)
		.innerJoin(meal, eq(mealPlanEntry.mealId, meal.id))
		.where(
			and(
				eq(mealPlanEntry.id, input.entryId),
				eq(mealPlanEntry.planId, input.planId),
				eq(meal.organizationId, input.organizationId),
			),
		)
		.limit(1);
	if (!entry) throw new Error("Manifest entry not found or unauthorized");

	const voided = await voidActivePersonalIntake(env.DB, {
		userId: input.userId,
		organizationId: input.organizationId,
		entryId: input.entryId,
	});

	return {
		cleared: voided != null,
		voidedIntakeId: voided?.id ?? null,
	};
}

/** @deprecated Prefer upsertManifestPersonalIntake — kept for stub callers. */
export async function logManifestNutritionIntake(
	env: Env,
	input: {
		organizationId: string;
		userId: string;
		planId: string;
		portions: Array<{ entryId: string; servings: number }>;
		idempotencyKey: string;
		operationId?: string;
		occurredAt?: Date;
		consent?: boolean;
		consentSource?: NutritionConsentSource;
		flagContext: FlagshipEvaluationContext;
	},
): Promise<{
	intakes: Array<{ id: string; entryId: string | null; servings: number }>;
	idempotent: boolean;
}> {
	if (input.portions.length !== 1 || !input.portions[0]) {
		throw new Error("logManifestNutritionIntake expects exactly one portion");
	}
	const portion = input.portions[0];
	const result = await upsertManifestPersonalIntake(env, {
		organizationId: input.organizationId,
		userId: input.userId,
		planId: input.planId,
		entryId: portion.entryId,
		servings: portion.servings,
		idempotencyKey: input.idempotencyKey,
		operationId: input.operationId,
		occurredAt: input.occurredAt,
		consent: input.consent,
		consentSource: input.consentSource,
		flagContext: input.flagContext,
	});
	return {
		intakes: [
			{
				id: result.intake.id,
				entryId: result.intake.entryId,
				servings: result.intake.servings,
			},
		],
		idempotent: result.idempotent,
	};
}

export { getActivePersonalIntakeForEntry };
