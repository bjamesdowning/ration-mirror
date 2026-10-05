import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import {
	cargo,
	meal,
	mealPlan,
	mealPlanEntry,
	nutritionGoal,
	nutritionIntake,
	supplyItem,
	supplyList,
} from "~/db/schema";
import type { FlagshipEvaluationContext } from "~/lib/feature-flags/context.server";
import { isFeatureEnabled } from "~/lib/feature-flags/flags.server";
import {
	energyGlance,
	selectAteFoods,
	selectNextMeal,
	selectSupplyPreview,
	WIDGET_ATE_LIMIT,
	WIDGET_SUPPLY_LIMIT,
} from "~/lib/home-widgets";
import { getNutritionConsentStatus } from "~/lib/nutrition/consent.server";

export type HomeWidgetSnapshot = {
	supply: {
		uncheckedCount: number;
		items: ReturnType<typeof selectSupplyPreview>;
	};
	ate: {
		available: boolean;
		foods: ReturnType<typeof selectAteFoods>;
	};
	today: {
		status: "clear" | "planned" | "done";
		title: string | null;
		uncheckedSupplyCount: number;
		remainingKcal: number | null;
		goalKcal: number | null;
	};
};

/**
 * Kitchen-scoped glance for the iOS widget extension.
 * Nutrition numbers are included only for the signed-in user with active consent.
 */
export async function loadHomeWidgetSnapshot(
	db: D1Database,
	env: Env,
	flagContext: FlagshipEvaluationContext,
	organizationId: string,
	userId: string,
	date: string,
): Promise<HomeWidgetSnapshot> {
	const d1 = drizzle(db);
	const [live] = await d1
		.select({ id: supplyList.id })
		.from(supplyList)
		.where(
			and(
				eq(supplyList.organizationId, organizationId),
				eq(supplyList.kind, "live"),
			),
		)
		.limit(1);

	let uncheckedCount = 0;
	let supplyItems: Array<{ id: string; name: string }> = [];
	if (live) {
		const [countRow] = await d1
			.select({
				total: sql<number>`count(*)`,
			})
			.from(supplyItem)
			.where(
				and(eq(supplyItem.listId, live.id), eq(supplyItem.isPurchased, false)),
			);
		uncheckedCount = Number(countRow?.total ?? 0);
		if (!Number.isFinite(uncheckedCount) || uncheckedCount < 0) {
			uncheckedCount = 0;
		}
		supplyItems = await d1
			.select({ id: supplyItem.id, name: supplyItem.name })
			.from(supplyItem)
			.where(
				and(eq(supplyItem.listId, live.id), eq(supplyItem.isPurchased, false)),
			)
			.orderBy(asc(supplyItem.sortOrder), asc(supplyItem.name))
			.limit(WIDGET_SUPPLY_LIMIT);
	}

	const ateAvailable =
		(await isFeatureEnabled(env, "cargo-quick-eat", flagContext)) &&
		(await isFeatureEnabled(env, "nutrition-cook-log-split", flagContext));
	let ateFoods: ReturnType<typeof selectAteFoods> = [];
	if (ateAvailable) {
		const cargoRows = await d1
			.select({
				id: cargo.id,
				name: cargo.name,
				unit: cargo.unit,
			})
			.from(cargo)
			.where(
				and(eq(cargo.organizationId, organizationId), eq(cargo.domain, "food")),
			)
			.orderBy(desc(cargo.updatedAt), desc(cargo.id))
			.limit(24);
		ateFoods = selectAteFoods(cargoRows, WIDGET_ATE_LIMIT);
	}

	const meals = await d1
		.select({
			name: meal.name,
			slotType: mealPlanEntry.slotType,
			orderIndex: mealPlanEntry.orderIndex,
			cookedAt: mealPlanEntry.cookedAt,
		})
		.from(mealPlanEntry)
		.innerJoin(mealPlan, eq(mealPlanEntry.planId, mealPlan.id))
		.innerJoin(meal, eq(mealPlanEntry.mealId, meal.id))
		.where(
			and(
				eq(mealPlan.organizationId, organizationId),
				eq(mealPlan.isArchived, false),
				eq(mealPlanEntry.date, date),
			),
		);
	const nextMeal = selectNextMeal(
		meals.map((row) => ({
			name: row.name,
			slotType: row.slotType,
			orderIndex: row.orderIndex,
			cooked: row.cookedAt != null,
		})),
	);

	const energy = await loadEnergyGlance(
		d1,
		db,
		env,
		flagContext,
		organizationId,
		userId,
		date,
	);

	return {
		supply: {
			uncheckedCount,
			items: selectSupplyPreview(supplyItems),
		},
		ate: {
			available: ateAvailable,
			foods: ateFoods,
		},
		today: {
			status: nextMeal.status,
			title: nextMeal.title,
			uncheckedSupplyCount: uncheckedCount,
			remainingKcal: energy?.remainingKcal ?? null,
			goalKcal: energy?.goalKcal ?? null,
		},
	};
}

async function loadEnergyGlance(
	d1: ReturnType<typeof drizzle>,
	db: D1Database,
	env: Env,
	flagContext: FlagshipEvaluationContext,
	organizationId: string,
	userId: string,
	date: string,
) {
	const [engine, goalsOn, manifestOn] = await Promise.all([
		isFeatureEnabled(env, "nutrition-engine", flagContext),
		isFeatureEnabled(env, "nutrition-goals", flagContext),
		isFeatureEnabled(env, "nutrition-manifest", flagContext),
	]);
	if (!engine || !goalsOn || !manifestOn) return null;

	const [goalsConsent, intakeConsent] = await Promise.all([
		getNutritionConsentStatus(db, userId, "goals"),
		getNutritionConsentStatus(db, userId, "intake"),
	]);
	if (goalsConsent.state !== "active" || intakeConsent.state !== "active") {
		return null;
	}

	const goalRows = await d1
		.select({
			dailyEnergyKcal: nutritionGoal.dailyEnergyKcal,
			effectiveFrom: nutritionGoal.effectiveFrom,
			effectiveTo: nutritionGoal.effectiveTo,
		})
		.from(nutritionGoal)
		.where(eq(nutritionGoal.userId, userId))
		.orderBy(desc(nutritionGoal.effectiveFrom))
		.limit(12);
	const goal = goalRows.find(
		(row) =>
			row.effectiveFrom <= date &&
			(row.effectiveTo == null || row.effectiveTo >= date),
	);
	if (goal?.dailyEnergyKcal == null) return null;

	const crossOrg =
		(await isFeatureEnabled(env, "nutrition-cross-org-diary", flagContext)) &&
		(manifestOn || goalsOn);
	const intakeWhere = [
		eq(nutritionIntake.userId, userId),
		eq(nutritionIntake.manifestDate, date),
		isNull(nutritionIntake.voidedAt),
	];
	if (!crossOrg) {
		intakeWhere.push(eq(nutritionIntake.organizationId, organizationId));
	}
	const [sumRow] = await d1
		.select({
			total: sql<number>`coalesce(sum(${nutritionIntake.energyKcal}), 0)`,
		})
		.from(nutritionIntake)
		.where(and(...intakeWhere));
	const consumed = Number(sumRow?.total ?? 0);
	return energyGlance(goal.dailyEnergyKcal, consumed);
}
