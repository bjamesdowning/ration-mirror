import {
	and,
	desc,
	eq,
	gt,
	gte,
	inArray,
	isNull,
	lte,
	or,
	sql,
} from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "~/db/schema";
import {
	buildSystemFlagContext,
	type FlagshipEvaluationContext,
} from "~/lib/feature-flags/context.server";
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
} from "./goal-effective";
import { mapWithConcurrency } from "./map-concurrency";
import {
	type CargoOverrideCandidate,
	nutrientsPer100gFromCargoOverride,
	pickBestCargoOverrideForIngredient,
} from "./override-scale";
import { resolveFoodName } from "./resolve-food.server";
import { projectNullableValuesToLegacy } from "./scale-nutrients";
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

/** @deprecated Use {@link buildSystemFlagContext}. */
export function buildMinimalFlagContext(
	env: { RATION_ENV?: string },
	userId?: string | null,
): FlagshipEvaluationContext {
	return buildSystemFlagContext(env, userId);
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
export type RecomputeMealNutritionOptions = {
	/** When set, commit only if meal.nutritionRevision still equals this value. */
	expectedSourceRevision?: number;
	leaseToken?: string;
	jobKey?: string;
};

export async function recomputeAndStoreMealNutrition(
	env: Env,
	db: D1Database,
	mealId: string,
	organizationId: string,
	flagContext: FlagshipEvaluationContext,
	opts?: RecomputeMealNutritionOptions,
): Promise<MealNutritionSnapshot | null> {
	const enabled = await isFeatureEnabled(env, "nutrition-engine", flagContext);
	if (!enabled) return null;

	const d1 = drizzle(db, { schema });
	const [mealRow] = await d1
		.select({
			id: schema.meal.id,
			servings: schema.meal.servings,
			nutritionRevision: schema.meal.nutritionRevision,
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

	if (
		opts?.expectedSourceRevision != null &&
		mealRow.nutritionRevision !== opts.expectedSourceRevision
	) {
		throw new Error("stale_revision");
	}

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

			const resolved = await resolveFoodName(env, ing.ingredientName, {
				organizationId,
				// Meal aggregates must stay fail-closed — medium is for scan review only.
				requireAutoAccept: true,
			});
			return {
				name: ing.ingredientName,
				quantity: ing.quantity,
				unit: (unit ?? ing.unit) as SupportedUnit | null,
				// Meal aggregate still uses legacy numeric macros; null cores → 0 at this boundary.
				nutrientsPer100g: resolved
					? projectNullableValuesToLegacy(resolved.nutrientsPer100g)
					: null,
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

	const now = new Date();
	const commitConditions = [
		eq(schema.meal.id, mealId),
		eq(schema.meal.organizationId, organizationId),
	];
	if (opts?.expectedSourceRevision != null) {
		commitConditions.push(
			eq(schema.meal.nutritionRevision, opts.expectedSourceRevision),
		);
	}

	const committed = await d1
		.update(schema.meal)
		.set({
			nutrition: snapshot,
			nutritionComputedRevision: mealRow.nutritionRevision,
			nutritionStatus: "current",
			nutritionUpdatedAt: now,
			// Do not bump meal.updatedAt for derived nutrition-only writes.
		})
		.where(and(...commitConditions))
		.returning({ id: schema.meal.id });

	if (committed.length === 0) {
		throw new Error("stale_revision");
	}

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

	const { scheduleMealNutritionRecompute } = await import(
		"./recompute-outbox.server"
	);
	const results = await mapWithConcurrency(
		mealIds,
		NUTRITION_MEAL_RECOMPUTE_CONCURRENCY,
		(mealId) =>
			scheduleMealNutritionRecompute(
				env,
				db,
				mealId,
				organizationId,
				flagContext,
				{
					trigger: "cargo_override",
					origin: {
						surface: String(flagContext.clientPlatform ?? "system"),
						userId:
							typeof flagContext.userId === "string"
								? flagContext.userId
								: null,
						clientVersion:
							typeof flagContext.clientVersion === "string"
								? flagContext.clientVersion
								: null,
						country:
							typeof flagContext.country === "string"
								? flagContext.country
								: null,
						environment:
							typeof flagContext.environment === "string"
								? flagContext.environment
								: null,
						plan:
							typeof flagContext.plan === "string" ? flagContext.plan : null,
					},
				},
			),
	);
	return results.filter((r) => r.mode !== "skipped").length;
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

export type NutritionSummaryResult = {
	from: string;
	to: string;
	totals: {
		energyKcal: number;
		proteinG: number;
		carbsG: number;
		fatG: number;
		/** Present only when ≥1 intake contributed a known fiberG from nutrientsJson. */
		fiberG?: number;
	};
	days: Array<{
		date: string;
		energyKcal: number;
		proteinG: number;
		carbsG: number;
		fatG: number;
		/** Present only when ≥1 intake that day contributed known fiberG. */
		fiberG?: number;
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
	entryId: string | null;
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
			entryId: schema.nutritionIntake.entryId,
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
		entryId: r.entryId ?? null,
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

/** Known fiber: scalar column, else JSON (legacy). Null stays unknown. */
const knownFiberSql = sql`coalesce(
	${schema.nutritionIntake.fiberG},
	case
		when json_type(${schema.nutritionIntake.nutrientsJson}, '$.fiberG') in ('integer', 'real')
		then cast(json_extract(${schema.nutritionIntake.nutrientsJson}, '$.fiberG') as real)
	end
)`;

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

	// One indexed grouped read — ≤93 day rows. Range totals fold from days (no JSON loop).
	const dayRows = await d1
		.select({
			date: schema.nutritionIntake.manifestDate,
			energyKcal: sql<number>`coalesce(sum(${schema.nutritionIntake.energyKcal}), 0)`,
			proteinG: sql<number>`coalesce(sum(${schema.nutritionIntake.proteinG}), 0)`,
			carbsG: sql<number>`coalesce(sum(${schema.nutritionIntake.carbsG}), 0)`,
			fatG: sql<number>`coalesce(sum(${schema.nutritionIntake.fatG}), 0)`,
			fiberG: sql<number | null>`case
				when count(${knownFiberSql}) > 0 then sum(${knownFiberSql})
				else null
			end`,
			coverageAvg: sql<number>`coalesce(avg(${schema.nutritionIntake.coverage}), 0)`,
			entryCount: sql<number>`count(*)`,
		})
		.from(schema.nutritionIntake)
		.where(whereClause)
		.groupBy(schema.nutritionIntake.manifestDate)
		.orderBy(schema.nutritionIntake.manifestDate);

	const days = dayRows.map((row) => ({
		date: row.date,
		energyKcal: row.energyKcal,
		proteinG: row.proteinG,
		carbsG: row.carbsG,
		fatG: row.fatG,
		...(row.fiberG != null ? { fiberG: row.fiberG } : {}),
		coverageAvg: row.coverageAvg,
		entryCount: row.entryCount,
	}));

	let energyKcal = 0;
	let proteinG = 0;
	let carbsG = 0;
	let fatG = 0;
	let fiberTotal: number | undefined;
	for (const day of days) {
		energyKcal += day.energyKcal;
		proteinG += day.proteinG;
		carbsG += day.carbsG;
		fatG += day.fatG;
		if (day.fiberG != null) {
			fiberTotal = (fiberTotal ?? 0) + day.fiberG;
		}
	}

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

	return {
		from,
		to,
		totals: {
			energyKcal,
			proteinG,
			carbsG,
			fatG,
			...(fiberTotal != null ? { fiberG: fiberTotal } : {}),
		},
		days,
		goal,
	};
}

export const NUTRITION_INTAKE_PURGE_BATCH = 250;
export const NUTRITION_RECOMPUTE_COMPLETED_RETENTION_DAYS = 15;
export const NUTRITION_RECOMPUTE_FAILED_RETENTION_DAYS = 30;
export const NUTRITION_RECOMPUTE_JOB_PURGE_BATCH = 500;

/**
 * Delete intake rows older than retention (default 396 days) in bounded ID batches.
 */
export async function purgeExpiredNutritionIntake(
	db: D1Database,
	now: Date,
	retentionDays = 396,
	limit = NUTRITION_INTAKE_PURGE_BATCH,
): Promise<number> {
	const cutoff = nutritionIntakeRetentionCutoff(now, retentionDays);
	const cutoffUnix = Math.floor(cutoff.getTime() / 1000);
	const result = await db
		.prepare(
			`DELETE FROM nutrition_intake
       WHERE id IN (
         SELECT id FROM nutrition_intake
         WHERE occurred_at < ?1
         ORDER BY occurred_at ASC
         LIMIT ?2
       )`,
		)
		.bind(cutoffUnix, limit)
		.run();
	return result.meta?.changes ?? 0;
}

/** Purge completed (15d) / failed (30d) recompute jobs; never age-purge pending. */
export async function purgeExpiredNutritionRecomputeJobs(
	db: D1Database,
	now: Date,
	limit = NUTRITION_RECOMPUTE_JOB_PURGE_BATCH,
): Promise<number> {
	const completedCutoff = Math.floor(
		(now.getTime() -
			NUTRITION_RECOMPUTE_COMPLETED_RETENTION_DAYS * 86_400_000) /
			1000,
	);
	const failedCutoff = Math.floor(
		(now.getTime() - NUTRITION_RECOMPUTE_FAILED_RETENTION_DAYS * 86_400_000) /
			1000,
	);
	const result = await db
		.prepare(
			`DELETE FROM nutrition_recompute_job
       WHERE job_key IN (
         SELECT job_key FROM nutrition_recompute_job
         WHERE (
           (status = 'completed' AND coalesce(completed_at, updated_at) < ?1)
           OR (status = 'failed' AND updated_at < ?2)
         )
         ORDER BY updated_at ASC
         LIMIT ?3
       )`,
		)
		.bind(completedCutoff, failedCutoff, limit)
		.run();
	return result.meta?.changes ?? 0;
}
