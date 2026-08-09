import {
	and,
	desc,
	eq,
	gt,
	gte,
	inArray,
	isNull,
	lt,
	lte,
	or,
	sql,
} from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "~/db/schema";
import type { FlagshipEvaluationContext } from "~/lib/feature-flags/context.server";
import { isFeatureEnabled } from "~/lib/feature-flags/flags.server";
import { normalizeForCargoDedup } from "~/lib/matching";
import { chunkedQuery } from "~/lib/query-utils.server";
import type { SupportedUnit } from "~/lib/units";
import { toSupportedUnit } from "~/lib/units";
import {
	type ResolveCargoNutritionOptions,
	resolveAndBuildCargoNutrition,
} from "./cargo-nutrition.server";
import { computeMealNutrition } from "./compute-meal-nutrition";
import {
	NUTRITION_MEAL_RECOMPUTE_CONCURRENCY,
	NUTRITION_RESOLVE_CONCURRENCY,
} from "./constants";
import {
	isGoalEffectiveOnDate,
	nutritionIntakeRetentionCutoff,
	previousUtcCalendarDay,
} from "./goal-effective";
import { mapWithConcurrency } from "./map-concurrency";
import {
	type CargoOverrideCandidate,
	nutrientsPer100gFromCargoOverride,
	pickBestCargoOverrideForIngredient,
} from "./override-scale";
import { resolveFoodName } from "./resolve-food.server";
import type {
	MealNutritionSnapshot,
	NutritionSnapshot,
	NutritionSource,
} from "./types";

/** Cap meal recomputes triggered by a single cargo nutrition update. */
export const MAX_MEALS_RECOMPUTE_ON_CARGO_NUTRITION = 50;

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

function toOverrideCandidate(r: {
	id: string;
	name: string;
	quantity: number;
	unit: string;
	nutrition: unknown;
	updatedAt: Date | string | number | null;
}): CargoOverrideCandidate | null {
	if (
		r.nutrition == null ||
		typeof r.nutrition !== "object" ||
		(r.nutrition as NutritionSnapshot).source !== "user_override"
	) {
		return null;
	}
	return {
		id: r.id,
		name: r.name,
		quantity: r.quantity,
		unit: r.unit,
		nutrition: r.nutrition as NutritionSnapshot,
		updatedAt: r.updatedAt,
	};
}

/**
 * Load org cargo rows with user_override nutrition. Always includes any
 * meal-linked cargo IDs so linked overrides are never dropped by the sample cap.
 */
async function loadOrgCargoOverrideCandidates(
	db: D1Database,
	organizationId: string,
	linkedCargoIds: string[] = [],
): Promise<CargoOverrideCandidate[]> {
	const d1 = drizzle(db, { schema });
	const rows = await d1
		.select({
			id: schema.cargo.id,
			name: schema.cargo.name,
			quantity: schema.cargo.quantity,
			unit: schema.cargo.unit,
			nutrition: schema.cargo.nutrition,
			updatedAt: schema.cargo.updatedAt,
		})
		.from(schema.cargo)
		.where(
			and(
				eq(schema.cargo.organizationId, organizationId),
				sql`json_extract(${schema.cargo.nutrition}, '$.source') = 'user_override'`,
			),
		)
		.orderBy(desc(schema.cargo.updatedAt))
		.limit(500);

	const byId = new Map<string, CargoOverrideCandidate>();
	for (const r of rows) {
		const candidate = toOverrideCandidate(r);
		if (candidate) byId.set(candidate.id, candidate);
	}

	const missingLinked = [
		...new Set(linkedCargoIds.filter((id) => id && !byId.has(id))),
	];
	if (missingLinked.length > 0) {
		const linkedRows = await chunkedQuery(missingLinked, (chunk) =>
			d1
				.select({
					id: schema.cargo.id,
					name: schema.cargo.name,
					quantity: schema.cargo.quantity,
					unit: schema.cargo.unit,
					nutrition: schema.cargo.nutrition,
					updatedAt: schema.cargo.updatedAt,
				})
				.from(schema.cargo)
				.where(
					and(
						eq(schema.cargo.organizationId, organizationId),
						inArray(schema.cargo.id, chunk),
					),
				),
		);
		for (const r of linkedRows) {
			const candidate = toOverrideCandidate(r);
			if (candidate) byId.set(candidate.id, candidate);
		}
	}

	return [...byId.values()];
}

/**
 * Recompute meal nutrition from ingredients and store on meal.nutrition.
 * Prefer cargo `user_override` snapshots over USDA when a cargo match exists.
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
			cargoId: schema.mealIngredient.cargoId,
		})
		.from(schema.mealIngredient)
		.where(eq(schema.mealIngredient.mealId, mealId))
		.orderBy(schema.mealIngredient.orderIndex);

	const linkedCargoIds = ingredients
		.map((ing) => ing.cargoId)
		.filter((id): id is string => typeof id === "string" && id.length > 0);

	const overrideCandidates = await loadOrgCargoOverrideCandidates(
		db,
		organizationId,
		linkedCargoIds,
	);

	const resolvedInputs = await mapWithConcurrency(
		ingredients,
		NUTRITION_RESOLVE_CONCURRENCY,
		async (ing) => {
			const unit = toSupportedUnit(ing.unit);
			const override = pickBestCargoOverrideForIngredient(
				ing.ingredientName,
				overrideCandidates,
				ing.cargoId,
			);
			if (override) {
				const packageUnit = toSupportedUnit(override.unit);
				const nutrientsPer100g = nutrientsPer100gFromCargoOverride(
					override.nutrition,
					override.quantity,
					packageUnit,
					override.name,
				);
				if (nutrientsPer100g) {
					return {
						name: ing.ingredientName,
						quantity: ing.quantity,
						unit: (unit ?? ing.unit) as SupportedUnit | null,
						nutrientsPer100g,
						fdcId: override.nutrition.fdcId ?? null,
						source: "user_override" as NutritionSource,
					};
				}
			}

			const resolved = await resolveFoodName(env, ing.ingredientName);
			return {
				name: ing.ingredientName,
				quantity: ing.quantity,
				unit: (unit ?? ing.unit) as SupportedUnit | null,
				nutrientsPer100g: resolved?.nutrientsPer100g ?? null,
				fdcId: resolved?.fdcId ?? null,
				source: "usda" as NutritionSource,
			};
		},
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

/**
 * After cargo nutrition is set/cleared as user_override, refresh meals that
 * reference that cargo (direct link, exact name, or cargo-dedup key). Bounded.
 */
export async function recomputeMealsAffectedByCargoNutrition(
	env: Env,
	db: D1Database,
	organizationId: string,
	cargoId: string,
	cargoName: string,
	flagContext: FlagshipEvaluationContext,
): Promise<number> {
	const enabled = await isFeatureEnabled(env, "nutrition-engine", flagContext);
	if (!enabled) return 0;

	const d1 = drizzle(db, { schema });
	const normalizedName = cargoName.trim().toLowerCase();
	const cargoDedupKey = normalizeForCargoDedup(cargoName);

	const [directRows, nameRows, unlinkedSample] = await d1.batch([
		d1
			.select({ mealId: schema.mealIngredient.mealId })
			.from(schema.mealIngredient)
			.innerJoin(schema.meal, eq(schema.mealIngredient.mealId, schema.meal.id))
			.where(
				and(
					eq(schema.meal.organizationId, organizationId),
					eq(schema.mealIngredient.cargoId, cargoId),
				),
			),
		d1
			.select({ mealId: schema.mealIngredient.mealId })
			.from(schema.mealIngredient)
			.innerJoin(schema.meal, eq(schema.mealIngredient.mealId, schema.meal.id))
			.where(
				and(
					eq(schema.meal.organizationId, organizationId),
					isNull(schema.mealIngredient.cargoId),
					sql`lower(${schema.mealIngredient.ingredientName}) = ${normalizedName}`,
				),
			),
		// Bounded sample for synonym/prep-stripped dedup matches (courgette/zucchini).
		d1
			.select({
				mealId: schema.mealIngredient.mealId,
				ingredientName: schema.mealIngredient.ingredientName,
			})
			.from(schema.mealIngredient)
			.innerJoin(schema.meal, eq(schema.mealIngredient.mealId, schema.meal.id))
			.where(
				and(
					eq(schema.meal.organizationId, organizationId),
					isNull(schema.mealIngredient.cargoId),
				),
			)
			.limit(500),
	]);

	const dedupMealIds =
		cargoDedupKey.length > 0
			? unlinkedSample
					.filter(
						(r) => normalizeForCargoDedup(r.ingredientName) === cargoDedupKey,
					)
					.map((r) => r.mealId)
			: [];

	const mealIds = [
		...new Set([
			...directRows.map((r) => r.mealId),
			...nameRows.map((r) => r.mealId),
			...dedupMealIds,
		]),
	].slice(0, MAX_MEALS_RECOMPUTE_ON_CARGO_NUTRITION);

	const snaps = await mapWithConcurrency(
		mealIds,
		NUTRITION_MEAL_RECOMPUTE_CONCURRENCY,
		(mealId) =>
			recomputeAndStoreMealNutrition(
				env,
				db,
				mealId,
				organizationId,
				flagContext,
			),
	);
	return snaps.filter(Boolean).length;
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
	dailyEnergyKcal: number | null;
	proteinG: number | null;
	carbsG: number | null;
	fatG: number | null;
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

	// Always close open priors ending the day before the new goal so two goals
	// never share an effective calendar day (including same-day replace).
	const closeTo =
		previousUtcCalendarDay(input.effectiveFrom) ?? input.effectiveFrom;
	for (const prior of openGoals) {
		stmts.push(
			d1
				.update(schema.nutritionGoal)
				.set({ effectiveTo: closeTo })
				.where(eq(schema.nutritionGoal.id, prior.id)),
		);
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
	schemaVersion?: number;
	nutrientsJson?: Record<string, number | null> | null;
	coverageJson?: Record<string, number> | null;
	idempotencyKey?: string | null;
	operationId?: string | null;
	replacesIntakeId?: string | null;
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
			schemaVersion: input.schemaVersion ?? 1,
			nutrientsJson: input.nutrientsJson ?? null,
			coverageJson: input.coverageJson ?? null,
			idempotencyKey: input.idempotencyKey ?? null,
			operationId: input.operationId ?? null,
			replacesIntakeId: input.replacesIntakeId ?? null,
		})
		.returning();

	return row ?? null;
}

export type PersonalIntakeSummary = {
	id: string;
	entryId: string;
	servings: number;
	energyKcal: number;
	proteinG: number;
	carbsG: number;
	fatG: number;
	occurredAt: Date;
	idempotencyKey: string | null;
	replacesIntakeId: string | null;
};

/**
 * Active (non-voided) personal intake for one Manifest entry.
 */
export async function getActivePersonalIntakeForEntry(
	db: D1Database,
	userId: string,
	organizationId: string,
	entryId: string,
): Promise<typeof schema.nutritionIntake.$inferSelect | null> {
	const d1 = drizzle(db, { schema });
	const [row] = await d1
		.select()
		.from(schema.nutritionIntake)
		.where(
			and(
				eq(schema.nutritionIntake.userId, userId),
				eq(schema.nutritionIntake.organizationId, organizationId),
				eq(schema.nutritionIntake.entryId, entryId),
				isNull(schema.nutritionIntake.voidedAt),
			),
		)
		.limit(1);
	return row ?? null;
}

/**
 * Active personal intakes for many entries (caller-scoped only).
 * Uses chunkedQuery when entry ID lists may exceed D1 bind limits.
 */
export async function getActivePersonalIntakesForEntries(
	db: D1Database,
	userId: string,
	organizationId: string,
	entryIds: string[],
): Promise<Map<string, PersonalIntakeSummary>> {
	const unique = [...new Set(entryIds.filter(Boolean))];
	const result = new Map<string, PersonalIntakeSummary>();
	if (unique.length === 0) return result;

	const d1 = drizzle(db, { schema });

	const rows = await chunkedQuery(unique, (chunk) =>
		d1
			.select({
				id: schema.nutritionIntake.id,
				entryId: schema.nutritionIntake.entryId,
				servings: schema.nutritionIntake.servings,
				energyKcal: schema.nutritionIntake.energyKcal,
				proteinG: schema.nutritionIntake.proteinG,
				carbsG: schema.nutritionIntake.carbsG,
				fatG: schema.nutritionIntake.fatG,
				occurredAt: schema.nutritionIntake.occurredAt,
				idempotencyKey: schema.nutritionIntake.idempotencyKey,
				replacesIntakeId: schema.nutritionIntake.replacesIntakeId,
			})
			.from(schema.nutritionIntake)
			.where(
				and(
					eq(schema.nutritionIntake.userId, userId),
					eq(schema.nutritionIntake.organizationId, organizationId),
					inArray(schema.nutritionIntake.entryId, chunk),
					isNull(schema.nutritionIntake.voidedAt),
				),
			),
	);

	for (const row of rows) {
		if (!row.entryId) continue;
		result.set(row.entryId, {
			id: row.id,
			entryId: row.entryId,
			servings: row.servings,
			energyKcal: row.energyKcal,
			proteinG: row.proteinG,
			carbsG: row.carbsG,
			fatG: row.fatG,
			occurredAt: row.occurredAt,
			idempotencyKey: row.idempotencyKey,
			replacesIntakeId: row.replacesIntakeId,
		});
	}
	return result;
}

/**
 * Soft-void the caller's active intake for an entry. Returns the voided row.
 */
export async function voidActivePersonalIntake(
	db: D1Database,
	input: {
		userId: string;
		organizationId: string;
		entryId: string;
		now?: Date;
	},
): Promise<typeof schema.nutritionIntake.$inferSelect | null> {
	const existing = await getActivePersonalIntakeForEntry(
		db,
		input.userId,
		input.organizationId,
		input.entryId,
	);
	if (!existing) return null;

	const d1 = drizzle(db, { schema });
	const now = input.now ?? new Date();
	await d1
		.update(schema.nutritionIntake)
		.set({ voidedAt: now, voidedByUserId: input.userId })
		.where(
			and(
				eq(schema.nutritionIntake.id, existing.id),
				eq(schema.nutritionIntake.userId, input.userId),
				isNull(schema.nutritionIntake.voidedAt),
			),
		);
	return { ...existing, voidedAt: now, voidedByUserId: input.userId };
}

/**
 * Atomically void prior active row (if any) and insert a replacement.
 * Returns the new row and prior id (for undo restore).
 */
export async function replaceActivePersonalIntake(
	db: D1Database,
	input: InsertNutritionIntakeInput & {
		entryId: string;
		idempotencyKey: string;
	},
): Promise<{
	row: typeof schema.nutritionIntake.$inferSelect;
	replacedId: string | null;
}> {
	const prior = await getActivePersonalIntakeForEntry(
		db,
		input.userId,
		input.organizationId,
		input.entryId,
	);

	const d1 = drizzle(db, { schema });
	const now = input.occurredAt;
	const id = crypto.randomUUID();
	const replacedId = prior?.id ?? null;

	// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types are complex
	const stmts: any[] = [];
	if (prior) {
		stmts.push(
			d1
				.update(schema.nutritionIntake)
				.set({ voidedAt: now, voidedByUserId: input.userId })
				.where(
					and(
						eq(schema.nutritionIntake.id, prior.id),
						isNull(schema.nutritionIntake.voidedAt),
					),
				),
		);
	}

	stmts.push(
		d1.insert(schema.nutritionIntake).values({
			id,
			organizationId: input.organizationId,
			userId: input.userId,
			planId: input.planId ?? null,
			entryId: input.entryId,
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
			occurredAt: now,
			kitchenEventId: input.kitchenEventId ?? null,
			schemaVersion: input.schemaVersion ?? 2,
			nutrientsJson: input.nutrientsJson ?? null,
			coverageJson: input.coverageJson ?? null,
			idempotencyKey: input.idempotencyKey,
			operationId: input.operationId ?? null,
			replacesIntakeId: replacedId,
		}),
	);

	// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types are complex
	await d1.batch(stmts as [any, ...any[]]);

	const [row] = await d1
		.select()
		.from(schema.nutritionIntake)
		.where(eq(schema.nutritionIntake.id, id))
		.limit(1);
	if (!row) throw new Error("Failed to insert nutrition intake");
	return { row, replacedId };
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
		dailyEnergyKcal: number | null;
		proteinG: number | null;
		carbsG: number | null;
		fatG: number | null;
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

export type ListNutritionIntakesOptions = {
	limit?: number;
	/** Opaque cursor from a previous `nextCursor` (`manifestDate|occurredAtISO|id`). */
	cursor?: string;
};

const MAX_INTAKE_LIST_LIMIT = 500;

export type ListNutritionIntakesResult = {
	items: NutritionIntakeRow[];
	nextCursor: string | null;
};

export function encodeNutritionIntakeCursor(
	manifestDate: string,
	occurredAt: Date,
	id: string,
): string {
	return `${manifestDate}|${occurredAt.toISOString()}|${id}`;
}

export function decodeNutritionIntakeCursor(
	cursor: string,
): { manifestDate: string; occurredAt: Date; id: string } | null {
	const parts = cursor.split("|");
	if (parts.length < 3) return null;
	const manifestDate = parts[0] ?? "";
	const occurredAt = new Date(parts[1] ?? "");
	const id = parts.slice(2).join("|");
	if (!/^\d{4}-\d{2}-\d{2}$/.test(manifestDate)) return null;
	if (Number.isNaN(occurredAt.getTime()) || !id) return null;
	return { manifestDate, occurredAt, id };
}

/**
 * Individual intake rows for a date range (Manifest day history).
 * Cursor-paginated when `options.limit` is set; default cap 500 rows per call.
 */
export async function listNutritionIntakesForRange(
	db: D1Database,
	userId: string,
	orgId: string,
	from: string,
	to: string,
	options: ListNutritionIntakesOptions = {},
): Promise<ListNutritionIntakesResult> {
	const d1 = drizzle(db, { schema });
	const limit = Math.min(
		Math.max(options.limit ?? MAX_INTAKE_LIST_LIMIT, 1),
		MAX_INTAKE_LIST_LIMIT,
	);
	const decoded = options.cursor
		? decodeNutritionIntakeCursor(options.cursor)
		: null;

	const baseWhere = and(
		eq(schema.nutritionIntake.userId, userId),
		eq(schema.nutritionIntake.organizationId, orgId),
		gte(schema.nutritionIntake.manifestDate, from),
		lte(schema.nutritionIntake.manifestDate, to),
		isNull(schema.nutritionIntake.voidedAt),
	);

	const cursorWhere = decoded
		? or(
				gt(schema.nutritionIntake.manifestDate, decoded.manifestDate),
				and(
					eq(schema.nutritionIntake.manifestDate, decoded.manifestDate),
					gt(schema.nutritionIntake.occurredAt, decoded.occurredAt),
				),
				and(
					eq(schema.nutritionIntake.manifestDate, decoded.manifestDate),
					eq(schema.nutritionIntake.occurredAt, decoded.occurredAt),
					gt(schema.nutritionIntake.id, decoded.id),
				),
			)
		: undefined;

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
		.where(cursorWhere ? and(baseWhere, cursorWhere) : baseWhere)
		.orderBy(
			schema.nutritionIntake.manifestDate,
			schema.nutritionIntake.occurredAt,
			schema.nutritionIntake.id,
		)
		.limit(limit + 1);

	const page = rows.slice(0, limit);
	const items = page.map((r) => ({
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

	const last = page.at(-1);
	const nextCursor =
		rows.length > limit && last
			? encodeNutritionIntakeCursor(last.manifestDate, last.occurredAt, last.id)
			: null;

	return { items, nextCursor };
}

export async function getNutritionSummary(
	db: D1Database,
	userId: string,
	orgId: string,
	from: string,
	to: string,
): Promise<NutritionSummaryResult> {
	const d1 = drizzle(db, { schema });
	const whereClause = and(
		eq(schema.nutritionIntake.userId, userId),
		eq(schema.nutritionIntake.organizationId, orgId),
		gte(schema.nutritionIntake.manifestDate, from),
		lte(schema.nutritionIntake.manifestDate, to),
		isNull(schema.nutritionIntake.voidedAt),
	);

	const [totalRow] = await d1
		.select({
			energyKcal: sql<number>`coalesce(sum(${schema.nutritionIntake.energyKcal}), 0)`,
			proteinG: sql<number>`coalesce(sum(${schema.nutritionIntake.proteinG}), 0)`,
			carbsG: sql<number>`coalesce(sum(${schema.nutritionIntake.carbsG}), 0)`,
			fatG: sql<number>`coalesce(sum(${schema.nutritionIntake.fatG}), 0)`,
		})
		.from(schema.nutritionIntake)
		.where(whereClause);

	const dayRows = await d1
		.select({
			date: schema.nutritionIntake.manifestDate,
			energyKcal: sql<number>`coalesce(sum(${schema.nutritionIntake.energyKcal}), 0)`,
			proteinG: sql<number>`coalesce(sum(${schema.nutritionIntake.proteinG}), 0)`,
			carbsG: sql<number>`coalesce(sum(${schema.nutritionIntake.carbsG}), 0)`,
			fatG: sql<number>`coalesce(sum(${schema.nutritionIntake.fatG}), 0)`,
			coverageAvg: sql<number>`coalesce(avg(${schema.nutritionIntake.coverage}), 0)`,
			entryCount: sql<number>`count(*)`,
		})
		.from(schema.nutritionIntake)
		.where(whereClause)
		.groupBy(schema.nutritionIntake.manifestDate)
		.orderBy(schema.nutritionIntake.manifestDate);

	const totals = {
		energyKcal: totalRow?.energyKcal ?? 0,
		proteinG: totalRow?.proteinG ?? 0,
		carbsG: totalRow?.carbsG ?? 0,
		fatG: totalRow?.fatG ?? 0,
	};

	const days = dayRows.map((row) => ({
		date: row.date,
		energyKcal: row.energyKcal,
		proteinG: row.proteinG,
		carbsG: row.carbsG,
		fatG: row.fatG,
		coverageAvg: row.coverageAvg,
		entryCount: row.entryCount,
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
