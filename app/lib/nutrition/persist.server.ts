import { and, eq, gte, isNull, lt, lte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "~/db/schema";
import type { FlagshipEvaluationContext } from "~/lib/feature-flags/context.server";
import { isFeatureEnabled } from "~/lib/feature-flags/flags.server";
import type { SupportedUnit } from "~/lib/units";
import { toSupportedUnit } from "~/lib/units";
import {
	type ResolveCargoNutritionOptions,
	resolveAndBuildCargoNutrition,
} from "./cargo-nutrition.server";
import { computeMealNutrition } from "./compute-meal-nutrition";
import {
	isGoalEffectiveOnDate,
	nutritionIntakeRetentionCutoff,
	previousUtcCalendarDay,
} from "./goal-effective";
import { resolveFoodName } from "./resolve-food.server";
import type {
	MealNutritionSnapshot,
	NutritionSnapshot,
	NutritionSource,
} from "./types";

export {
	isGoalEffectiveOnDate,
	nutritionIntakeRetentionCutoff,
	previousUtcCalendarDay,
} from "./goal-effective";

/** Flag context when no Request is available (ingest, background, MCP). */
export function buildMinimalFlagContext(
	env: { RATION_ENV?: string },
	userId?: string | null,
): FlagshipEvaluationContext {
	const context: FlagshipEvaluationContext = {
		environment: env.RATION_ENV?.trim() || "unknown",
	};
	if (userId) {
		context.userId = userId;
	}
	return context;
}

export type MaybeResolveCargoNutritionOptions = ResolveCargoNutritionOptions & {
	/**
	 * Request AI fill on USDA miss (AI ingest paths only).
	 * Also requires `nutrition-ai-estimate` — fail closed when that flag is off.
	 */
	allowAiEstimate?: boolean;
	organizationId?: string;
	userId?: string;
};

/**
 * When nutrition-engine is enabled, resolve cargo nutrition; otherwise null.
 */
export async function maybeResolveCargoNutrition(
	env: Env,
	name: string,
	flagContext: FlagshipEvaluationContext,
	opts?: MaybeResolveCargoNutritionOptions,
): Promise<NutritionSnapshot | null> {
	const enabled = await isFeatureEnabled(env, "nutrition-engine", flagContext);
	if (!enabled) return null;

	let allowAiEstimate = false;
	if (opts?.allowAiEstimate) {
		allowAiEstimate = await isFeatureEnabled(
			env,
			"nutrition-ai-estimate",
			flagContext,
		);
	}

	return resolveAndBuildCargoNutrition(env, name, {
		quantity: opts?.quantity,
		unit: opts?.unit,
		allowAiEstimate,
		organizationId: opts?.organizationId,
		userId: opts?.userId,
	});
}

/**
 * Recompute meal nutrition from ingredients and store on meal.nutrition.
 * No-op when nutrition-engine is off. Returns the stored snapshot or null.
 */
export async function recomputeAndStoreMealNutrition(
	env: Env,
	db: D1Database,
	mealId: string,
	organizationId: string,
	flagContext: FlagshipEvaluationContext,
): Promise<MealNutritionSnapshot | null> {
	const enabled = await isFeatureEnabled(env, "nutrition-engine", flagContext);
	if (!enabled) return null;

	const d1 = drizzle(db, { schema });
	const [mealRow] = await d1
		.select({
			id: schema.meal.id,
			servings: schema.meal.servings,
		})
		.from(schema.meal)
		.where(
			and(
				eq(schema.meal.id, mealId),
				eq(schema.meal.organizationId, organizationId),
			),
		)
		.limit(1);

	if (!mealRow) return null;

	const ingredients = await d1
		.select({
			ingredientName: schema.mealIngredient.ingredientName,
			quantity: schema.mealIngredient.quantity,
			unit: schema.mealIngredient.unit,
			orderIndex: schema.mealIngredient.orderIndex,
		})
		.from(schema.mealIngredient)
		.where(eq(schema.mealIngredient.mealId, mealId))
		.orderBy(schema.mealIngredient.orderIndex);

	const resolvedInputs = await Promise.all(
		ingredients.map(async (ing) => {
			const resolved = await resolveFoodName(env, ing.ingredientName);
			const unit = toSupportedUnit(ing.unit);
			return {
				name: ing.ingredientName,
				quantity: ing.quantity,
				unit: (unit ?? ing.unit) as SupportedUnit | null,
				nutrientsPer100g: resolved?.nutrientsPer100g ?? null,
				fdcId: resolved?.fdcId ?? null,
				source: "usda" as NutritionSource,
			};
		}),
	);

	const result = computeMealNutrition(resolvedInputs, mealRow.servings ?? 1);
	const snapshot: MealNutritionSnapshot = {
		perServing: result.perServing,
		coverage: result.coverage,
		attributions: result.attributions,
		computedAt: new Date().toISOString(),
	};

	await d1
		.update(schema.meal)
		.set({
			nutrition: snapshot,
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(schema.meal.id, mealId),
				eq(schema.meal.organizationId, organizationId),
			),
		);

	return snapshot;
}

export async function getActiveNutritionGoal(
	db: D1Database,
	userId: string,
	date: string,
) {
	const d1 = drizzle(db);
	const rows = await d1
		.select()
		.from(schema.nutritionGoal)
		.where(eq(schema.nutritionGoal.userId, userId))
		.orderBy(sql`${schema.nutritionGoal.effectiveFrom} desc`)
		.limit(50);

	return (
		rows.find((row) =>
			isGoalEffectiveOnDate(
				{
					effectiveFrom: row.effectiveFrom,
					effectiveTo: row.effectiveTo,
				},
				date,
			),
		) ?? null
	);
}

export type UpsertNutritionGoalInput = {
	userId: string;
	dailyEnergyKcal: number;
	proteinG: number;
	carbsG: number;
	fatG: number;
	fiberG?: number | null;
	effectiveFrom: string;
	consentAt: Date;
};

/**
 * Insert a new goal version; close any open-ended prior goal ending the day
 * before `effectiveFrom`.
 */
export async function upsertNutritionGoal(
	db: D1Database,
	input: UpsertNutritionGoalInput,
) {
	const d1 = drizzle(db);
	const now = new Date();

	const openGoals = await d1
		.select()
		.from(schema.nutritionGoal)
		.where(
			and(
				eq(schema.nutritionGoal.userId, input.userId),
				isNull(schema.nutritionGoal.effectiveTo),
			),
		);

	// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types are complex
	const stmts: any[] = [];

	for (const prior of openGoals) {
		if (prior.effectiveFrom >= input.effectiveFrom) {
			// Same-day or future open goal: close ending on effectiveFrom (caller
			// replaces it). Prefer previous day when possible.
			const closeTo =
				prior.effectiveFrom < input.effectiveFrom
					? previousUtcCalendarDay(input.effectiveFrom)
					: input.effectiveFrom;
			stmts.push(
				d1
					.update(schema.nutritionGoal)
					.set({ effectiveTo: closeTo })
					.where(eq(schema.nutritionGoal.id, prior.id)),
			);
		} else {
			const closeTo = previousUtcCalendarDay(input.effectiveFrom);
			stmts.push(
				d1
					.update(schema.nutritionGoal)
					.set({
						effectiveTo: closeTo ?? input.effectiveFrom,
					})
					.where(eq(schema.nutritionGoal.id, prior.id)),
			);
		}
	}

	const id = crypto.randomUUID();
	stmts.push(
		d1.insert(schema.nutritionGoal).values({
			id,
			userId: input.userId,
			dailyEnergyKcal: input.dailyEnergyKcal,
			proteinG: input.proteinG,
			carbsG: input.carbsG,
			fatG: input.fatG,
			fiberG: input.fiberG ?? null,
			effectiveFrom: input.effectiveFrom,
			effectiveTo: null,
			consentAt: input.consentAt,
			createdAt: now,
		}),
	);

	// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types are complex
	await d1.batch(stmts as [any, ...any[]]);

	const [created] = await d1
		.select()
		.from(schema.nutritionGoal)
		.where(eq(schema.nutritionGoal.id, id))
		.limit(1);

	return created ?? null;
}

/**
 * Close all open-ended goals for the user so none remain effective on `asOfDate`.
 */
export async function clearNutritionGoal(
	db: D1Database,
	userId: string,
	asOfDate: string,
): Promise<number> {
	const d1 = drizzle(db);
	const openGoals = await d1
		.select()
		.from(schema.nutritionGoal)
		.where(
			and(
				eq(schema.nutritionGoal.userId, userId),
				isNull(schema.nutritionGoal.effectiveTo),
			),
		);

	if (openGoals.length === 0) return 0;

	// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types are complex
	const stmts: any[] = [];
	for (const prior of openGoals) {
		const closeTo =
			prior.effectiveFrom < asOfDate
				? (previousUtcCalendarDay(asOfDate) ?? asOfDate)
				: asOfDate;
		stmts.push(
			d1
				.update(schema.nutritionGoal)
				.set({ effectiveTo: closeTo })
				.where(eq(schema.nutritionGoal.id, prior.id)),
		);
	}

	// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types are complex
	await d1.batch(stmts as [any, ...any[]]);
	return openGoals.length;
}

export type InsertNutritionIntakeInput = {
	organizationId: string;
	userId: string;
	planId?: string | null;
	entryId?: string | null;
	mealId?: string | null;
	manifestDate: string;
	slotType?: string | null;
	servings: number;
	energyKcal: number;
	proteinG: number;
	carbsG: number;
	fatG: number;
	coverage: number;
	source: string;
	confidence: number;
	verified: 0 | 1;
	occurredAt: Date;
	kitchenEventId?: string | null;
};

export async function insertNutritionIntake(
	db: D1Database,
	input: InsertNutritionIntakeInput,
) {
	const d1 = drizzle(db);
	const id = crypto.randomUUID();
	const [row] = await d1
		.insert(schema.nutritionIntake)
		.values({
			id,
			organizationId: input.organizationId,
			userId: input.userId,
			planId: input.planId ?? null,
			entryId: input.entryId ?? null,
			mealId: input.mealId ?? null,
			manifestDate: input.manifestDate,
			slotType: input.slotType ?? null,
			servings: input.servings,
			energyKcal: input.energyKcal,
			proteinG: input.proteinG,
			carbsG: input.carbsG,
			fatG: input.fatG,
			coverage: input.coverage,
			source: input.source,
			confidence: input.confidence,
			verified: input.verified,
			occurredAt: input.occurredAt,
			kitchenEventId: input.kitchenEventId ?? null,
		})
		.returning();

	return row ?? null;
}

export type NutritionSummaryResult = {
	from: string;
	to: string;
	totals: {
		energyKcal: number;
		proteinG: number;
		carbsG: number;
		fatG: number;
	};
	days: Array<{
		date: string;
		energyKcal: number;
		proteinG: number;
		carbsG: number;
		fatG: number;
		coverageAvg: number;
		entryCount: number;
	}>;
	goal: {
		dailyEnergyKcal: number;
		proteinG: number;
		carbsG: number;
		fatG: number;
		fiberG: number | null;
		effectiveFrom: string;
		effectiveTo: string | null;
	} | null;
};

export type NutritionIntakeRow = {
	id: string;
	manifestDate: string;
	slotType: string | null;
	servings: number;
	energyKcal: number;
	proteinG: number;
	carbsG: number;
	fatG: number;
	mealId: string | null;
	mealName: string | null;
	verified: number;
	occurredAt: Date;
};

/**
 * Individual intake rows for a date range (Manifest day history).
 */
export async function listNutritionIntakesForRange(
	db: D1Database,
	userId: string,
	orgId: string,
	from: string,
	to: string,
): Promise<NutritionIntakeRow[]> {
	const d1 = drizzle(db, { schema });
	const rows = await d1
		.select({
			id: schema.nutritionIntake.id,
			manifestDate: schema.nutritionIntake.manifestDate,
			slotType: schema.nutritionIntake.slotType,
			servings: schema.nutritionIntake.servings,
			energyKcal: schema.nutritionIntake.energyKcal,
			proteinG: schema.nutritionIntake.proteinG,
			carbsG: schema.nutritionIntake.carbsG,
			fatG: schema.nutritionIntake.fatG,
			mealId: schema.nutritionIntake.mealId,
			mealName: schema.meal.name,
			verified: schema.nutritionIntake.verified,
			occurredAt: schema.nutritionIntake.occurredAt,
		})
		.from(schema.nutritionIntake)
		.leftJoin(schema.meal, eq(schema.nutritionIntake.mealId, schema.meal.id))
		.where(
			and(
				eq(schema.nutritionIntake.userId, userId),
				eq(schema.nutritionIntake.organizationId, orgId),
				gte(schema.nutritionIntake.manifestDate, from),
				lte(schema.nutritionIntake.manifestDate, to),
			),
		)
		.orderBy(
			schema.nutritionIntake.manifestDate,
			schema.nutritionIntake.occurredAt,
		)
		.limit(500);

	return rows.map((r) => ({
		id: r.id,
		manifestDate: r.manifestDate,
		slotType: r.slotType,
		servings: r.servings,
		energyKcal: r.energyKcal,
		proteinG: r.proteinG,
		carbsG: r.carbsG,
		fatG: r.fatG,
		mealId: r.mealId,
		mealName: r.mealName ?? null,
		verified: r.verified,
		occurredAt: r.occurredAt,
	}));
}

export async function getNutritionSummary(
	db: D1Database,
	userId: string,
	orgId: string,
	from: string,
	to: string,
): Promise<NutritionSummaryResult> {
	const d1 = drizzle(db);
	const rows = await d1
		.select()
		.from(schema.nutritionIntake)
		.where(
			and(
				eq(schema.nutritionIntake.userId, userId),
				eq(schema.nutritionIntake.organizationId, orgId),
				gte(schema.nutritionIntake.manifestDate, from),
				lte(schema.nutritionIntake.manifestDate, to),
			),
		)
		.orderBy(schema.nutritionIntake.manifestDate)
		.limit(2000);

	const byDate = new Map<
		string,
		{
			energyKcal: number;
			proteinG: number;
			carbsG: number;
			fatG: number;
			coverageSum: number;
			entryCount: number;
		}
	>();

	const totals = {
		energyKcal: 0,
		proteinG: 0,
		carbsG: 0,
		fatG: 0,
	};

	for (const row of rows) {
		totals.energyKcal += row.energyKcal;
		totals.proteinG += row.proteinG;
		totals.carbsG += row.carbsG;
		totals.fatG += row.fatG;

		const bucket = byDate.get(row.manifestDate) ?? {
			energyKcal: 0,
			proteinG: 0,
			carbsG: 0,
			fatG: 0,
			coverageSum: 0,
			entryCount: 0,
		};
		bucket.energyKcal += row.energyKcal;
		bucket.proteinG += row.proteinG;
		bucket.carbsG += row.carbsG;
		bucket.fatG += row.fatG;
		bucket.coverageSum += row.coverage;
		bucket.entryCount += 1;
		byDate.set(row.manifestDate, bucket);
	}

	const days = [...byDate.entries()].map(([date, b]) => ({
		date,
		energyKcal: b.energyKcal,
		proteinG: b.proteinG,
		carbsG: b.carbsG,
		fatG: b.fatG,
		coverageAvg: b.entryCount > 0 ? b.coverageSum / b.entryCount : 0,
		entryCount: b.entryCount,
	}));

	const goalRow = await getActiveNutritionGoal(db, userId, to);
	const goal = goalRow
		? {
				dailyEnergyKcal: goalRow.dailyEnergyKcal,
				proteinG: goalRow.proteinG,
				carbsG: goalRow.carbsG,
				fatG: goalRow.fatG,
				fiberG: goalRow.fiberG,
				effectiveFrom: goalRow.effectiveFrom,
				effectiveTo: goalRow.effectiveTo,
			}
		: null;

	return { from, to, totals, days, goal };
}

/**
 * Delete intake rows older than retention window (default 396 days ≈ 13 months).
 * Returns number of deleted rows (best-effort from D1 meta).
 */
export async function purgeExpiredNutritionIntake(
	db: D1Database,
	now: Date,
	retentionDays = 396,
): Promise<number> {
	const d1 = drizzle(db);
	const cutoff = nutritionIntakeRetentionCutoff(now, retentionDays);
	const result = await d1
		.delete(schema.nutritionIntake)
		.where(lt(schema.nutritionIntake.occurredAt, cutoff));
	return result.meta?.changes ?? 0;
}
