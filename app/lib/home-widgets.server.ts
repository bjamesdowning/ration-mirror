import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import {
	cargo,
	cargoTag,
	meal,
	mealPlan,
	mealPlanEntry,
	nutritionGoal,
	nutritionIntake,
	supplyItem,
	supplyList,
	tag,
} from "~/db/schema";
import type { FlagshipEvaluationContext } from "~/lib/feature-flags/context.server";
import { isFeatureEnabled } from "~/lib/feature-flags/flags.server";
import {
	energyGlance,
	macroGlance,
	selectAteFoods,
	selectNextMeal,
	selectSupplyPreview,
	selectTodayMeals,
	type HomeWidgetMacro,
	type HomeWidgetTagChoice,
	WIDGET_ATE_LIMIT,
	WIDGET_SUPPLY_LIMIT,
} from "~/lib/home-widgets";
import { getNutritionConsentStatus } from "~/lib/nutrition/consent.server";
import { isValidTagSlug } from "~/lib/tags";

export type HomeWidgetSnapshot = {
	supply: {
		uncheckedCount: number;
		items: ReturnType<typeof selectSupplyPreview>;
	};
	ate: {
		available: boolean;
		foods: ReturnType<typeof selectAteFoods>;
		tagChoices: HomeWidgetTagChoice[];
	};
	today: {
		status: "clear" | "planned" | "done";
		title: string | null;
		slotType: string | null;
		meals: ReturnType<typeof selectTodayMeals>;
		uncheckedSupplyCount: number;
		remainingKcal: number | null;
		goalKcal: number | null;
		protein: HomeWidgetMacro | null;
		carbs: HomeWidgetMacro | null;
		fat: HomeWidgetMacro | null;
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
	tagSlug: string | null = null,
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
	let tagChoices: HomeWidgetTagChoice[] = [];
	if (ateAvailable) {
		const requested = tagSlug?.trim() ?? "";
		const filtering = requested.length > 0;
		if (filtering && !isValidTagSlug(requested)) {
			ateFoods = [];
		} else {
			const cargoRows = filtering
				? await d1
						.select({
							id: cargo.id,
							name: cargo.name,
							unit: cargo.unit,
							quantity: cargo.quantity,
						})
						.from(cargo)
						.innerJoin(cargoTag, eq(cargoTag.cargoId, cargo.id))
						.innerJoin(tag, eq(tag.id, cargoTag.tagId))
						.where(
							and(
								eq(cargo.organizationId, organizationId),
								eq(cargo.domain, "food"),
								eq(tag.organizationId, organizationId),
								eq(tag.slug, requested),
							),
						)
						.orderBy(desc(cargo.updatedAt), desc(cargo.id))
						.limit(24)
				: await d1
						.select({
							id: cargo.id,
							name: cargo.name,
							unit: cargo.unit,
							quantity: cargo.quantity,
						})
						.from(cargo)
						.where(
							and(
								eq(cargo.organizationId, organizationId),
								eq(cargo.domain, "food"),
							),
						)
						.orderBy(desc(cargo.updatedAt), desc(cargo.id))
						.limit(24);
			ateFoods = selectAteFoods(cargoRows, WIDGET_ATE_LIMIT);
		}
		if (!filtering) {
			tagChoices = await loadFoodTagChoices(d1, organizationId);
		}
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

	const nutrition = await loadNutritionGlance(
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
			tagChoices,
		},
		today: {
			status: nextMeal.status,
			title: nextMeal.title,
			slotType: nextMeal.slotType,
			meals: selectTodayMeals(
				meals.map((row) => ({
					name: row.name,
					slotType: row.slotType,
					orderIndex: row.orderIndex,
					cooked: row.cookedAt != null,
				})),
			),
			uncheckedSupplyCount: uncheckedCount,
			remainingKcal: nutrition.energy?.remainingKcal ?? null,
			goalKcal: nutrition.energy?.goalKcal ?? null,
			protein: nutrition.protein,
			carbs: nutrition.carbs,
			fat: nutrition.fat,
		},
	};
}

async function loadFoodTagChoices(
	d1: ReturnType<typeof drizzle>,
	organizationId: string,
): Promise<HomeWidgetTagChoice[]> {
	const rows = await d1
		.selectDistinct({ slug: tag.slug, name: tag.name })
		.from(cargoTag)
		.innerJoin(tag, eq(cargoTag.tagId, tag.id))
		.innerJoin(cargo, eq(cargoTag.cargoId, cargo.id))
		.where(
			and(eq(cargo.organizationId, organizationId), eq(cargo.domain, "food")),
		)
		.orderBy(asc(tag.name))
		.limit(200);
	return rows
		.map((row) => ({
			slug: row.slug.trim().toLowerCase(),
			name: row.name.trim(),
		}))
		.filter((row) => row.slug.length > 0 && row.name.length > 0);
}

const emptyNutrition = {
	energy: null,
	protein: null,
	carbs: null,
	fat: null,
};

async function loadNutritionGlance(
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
	if (!engine || !goalsOn || !manifestOn) return emptyNutrition;

	const [goalsConsent, intakeConsent] = await Promise.all([
		getNutritionConsentStatus(db, userId, "goals"),
		getNutritionConsentStatus(db, userId, "intake"),
	]);
	if (goalsConsent.state !== "active" || intakeConsent.state !== "active") {
		return emptyNutrition;
	}

	const goalRows = await d1
		.select({
			dailyEnergyKcal: nutritionGoal.dailyEnergyKcal,
			proteinG: nutritionGoal.proteinG,
			carbsG: nutritionGoal.carbsG,
			fatG: nutritionGoal.fatG,
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
	if (!goal) return emptyNutrition;

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
			energy: sql<number>`coalesce(sum(${nutritionIntake.energyKcal}), 0)`,
			protein: sql<number>`coalesce(sum(${nutritionIntake.proteinG}), 0)`,
			carbs: sql<number>`coalesce(sum(${nutritionIntake.carbsG}), 0)`,
			fat: sql<number>`coalesce(sum(${nutritionIntake.fatG}), 0)`,
		})
		.from(nutritionIntake)
		.where(and(...intakeWhere));
	return {
		energy: energyGlance(goal.dailyEnergyKcal, Number(sumRow?.energy ?? 0)),
		protein: macroGlance(goal.proteinG, Number(sumRow?.protein ?? 0)),
		carbs: macroGlance(goal.carbsG, Number(sumRow?.carbs ?? 0)),
		fat: macroGlance(goal.fatG, Number(sumRow?.fat ?? 0)),
	};
}
