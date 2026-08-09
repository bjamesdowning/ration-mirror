/**
 * Galley Cook → Manifest bridge (nutrition-cook-log-split).
 * Ensures/reuses a plan entry for the local day, then cooks via cookManifestEntries
 * so Cargo is deducted once and the household sees Prepared. Never writes intake.
 */

import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { meal, mealPlanEntry } from "~/db/schema";
import type { CookMealWithConfirmationResult } from "~/lib/cook-confirmation.server";
import { cookMealWithConfirmation } from "~/lib/cook-confirmation.server";
import type { FlagshipEvaluationContext } from "~/lib/feature-flags/context.server";
import { isFeatureEnabled } from "~/lib/feature-flags/flags.server";
import {
	addEntry,
	deleteEntry,
	ensureMealPlan,
	type MealPlanEntryWithMeal,
	updateEntry,
} from "~/lib/manifest.server";
import {
	cookManifestEntries,
	isManifestEntryPrepared,
} from "~/lib/manifest-cook.server";
import { resolveManifestSlotType } from "~/lib/manifest-slot";
import type { MealNutritionSnapshot } from "~/lib/nutrition/types";
import type { KitchenEventSource } from "~/lib/schemas/kitchen-events";
import type { SlotType } from "~/lib/schemas/manifest";

export type GalleyCookManifestEntrySummary = {
	id: string;
	planId: string;
	mealId: string;
	date: string;
	slotType: string;
	mealName: string;
	mealServings: number;
	mealType: string;
	mealEnergyKcalPerServing: number | null;
	mealProteinGPerServing: number | null;
	mealCarbsGPerServing: number | null;
	mealFatGPerServing: number | null;
	cookedAt: string | null;
	consumedAt: string | null;
};

export type GalleyCookResult = CookMealWithConfirmationResult & {
	bridgedToManifest: boolean;
	offerPersonalLog: boolean;
	autoCreated: boolean;
	planId?: string;
	entry?: GalleyCookManifestEntrySummary;
	/** Prepared entry ids from cookManifestEntries (for undo). */
	manifestEntryIds?: string[];
	alreadyCookedIds?: string[];
};

function toIso(value: Date | string | null | undefined): string | null {
	if (value == null) return null;
	if (value instanceof Date) return value.toISOString();
	return String(value);
}

function nutritionFields(snap: MealNutritionSnapshot | null | undefined) {
	return {
		mealEnergyKcalPerServing: snap?.perServing?.energyKcal ?? null,
		mealProteinGPerServing: snap?.perServing?.proteinG ?? null,
		mealCarbsGPerServing: snap?.perServing?.carbG ?? null,
		mealFatGPerServing: snap?.perServing?.fatG ?? null,
	};
}

function toEntrySummary(
	row: MealPlanEntryWithMeal,
	nutrition?: MealNutritionSnapshot | null,
): GalleyCookManifestEntrySummary {
	const macros = nutritionFields(nutrition);
	return {
		id: row.id,
		planId: row.planId,
		mealId: row.mealId,
		date: row.date,
		slotType: row.slotType,
		mealName: row.mealName,
		mealServings: row.mealServings,
		mealType: row.mealType,
		mealEnergyKcalPerServing:
			row.mealEnergyKcalPerServing ?? macros.mealEnergyKcalPerServing,
		mealProteinGPerServing:
			row.mealProteinGPerServing ?? macros.mealProteinGPerServing,
		mealCarbsGPerServing:
			row.mealCarbsGPerServing ?? macros.mealCarbsGPerServing,
		mealFatGPerServing: row.mealFatGPerServing ?? macros.mealFatGPerServing,
		cookedAt: toIso(row.cookedAt),
		consumedAt: toIso(row.consumedAt),
	};
}

async function loadMealNutrition(
	env: Env,
	organizationId: string,
	mealId: string,
): Promise<{
	name: string;
	servings: number;
	type: string;
	nutrition: MealNutritionSnapshot | null;
} | null> {
	const d1 = drizzle(env.DB);
	const [row] = await d1
		.select({
			name: meal.name,
			servings: meal.servings,
			type: meal.type,
			nutrition: meal.nutrition,
		})
		.from(meal)
		.where(and(eq(meal.id, mealId), eq(meal.organizationId, organizationId)))
		.limit(1);
	if (!row) return null;
	return {
		name: row.name,
		servings: row.servings ?? 1,
		type: row.type ?? "recipe",
		nutrition: (row.nutrition as MealNutritionSnapshot | null) ?? null,
	};
}

/**
 * Resolve or create today's plan entry for this meal.
 * Prefers an uncooked entry in the inferred slot, else any uncooked on that date.
 * If all matching entries are already prepared, creates a new entry.
 */
export async function resolveOrCreateGalleyCookEntry(
	env: Env,
	organizationId: string,
	planId: string,
	input: {
		mealId: string;
		date: string;
		slotType: SlotType;
		servingsOverride?: number | null;
	},
): Promise<{ entry: MealPlanEntryWithMeal; autoCreated: boolean }> {
	const d1 = drizzle(env.DB);
	const rows = await d1
		.select({
			id: mealPlanEntry.id,
			planId: mealPlanEntry.planId,
			mealId: mealPlanEntry.mealId,
			date: mealPlanEntry.date,
			slotType: mealPlanEntry.slotType,
			orderIndex: mealPlanEntry.orderIndex,
			servingsOverride: mealPlanEntry.servingsOverride,
			notes: mealPlanEntry.notes,
			consumedAt: mealPlanEntry.consumedAt,
			cookedAt: mealPlanEntry.cookedAt,
			createdAt: mealPlanEntry.createdAt,
			mealName: meal.name,
			mealServings: meal.servings,
			mealType: meal.type,
			mealPrepTime: meal.prepTime,
			mealCookTime: meal.cookTime,
			mealNutrition: meal.nutrition,
		})
		.from(mealPlanEntry)
		.innerJoin(meal, eq(mealPlanEntry.mealId, meal.id))
		.where(
			and(
				eq(mealPlanEntry.planId, planId),
				eq(mealPlanEntry.mealId, input.mealId),
				eq(mealPlanEntry.date, input.date),
				eq(meal.organizationId, organizationId),
			),
		);

	const mapped = rows.map((r) => {
		const snap = r.mealNutrition as MealNutritionSnapshot | null;
		return {
			id: r.id,
			planId: r.planId,
			mealId: r.mealId,
			date: r.date,
			slotType: r.slotType,
			orderIndex: r.orderIndex,
			servingsOverride: r.servingsOverride,
			notes: r.notes,
			consumedAt: r.consumedAt,
			cookedAt: r.cookedAt,
			createdAt: r.createdAt,
			mealName: r.mealName,
			mealServings: r.mealServings ?? 1,
			mealType: r.mealType ?? "recipe",
			mealPrepTime: r.mealPrepTime ?? null,
			mealCookTime: r.mealCookTime ?? null,
			...nutritionFields(snap),
		} satisfies MealPlanEntryWithMeal;
	});

	const uncooked = mapped.filter((e) => !isManifestEntryPrepared(e));
	if (uncooked.length > 0) {
		const preferred =
			uncooked.find((e) => e.slotType === input.slotType) ?? uncooked[0];
		if (
			input.servingsOverride != null &&
			preferred.servingsOverride !== input.servingsOverride
		) {
			const updated = await updateEntry(
				env.DB,
				organizationId,
				planId,
				preferred.id,
				{ servingsOverride: input.servingsOverride },
			);
			if (updated) {
				return {
					entry: {
						...updated,
						mealEnergyKcalPerServing: preferred.mealEnergyKcalPerServing,
						mealProteinGPerServing: preferred.mealProteinGPerServing,
						mealCarbsGPerServing: preferred.mealCarbsGPerServing,
						mealFatGPerServing: preferred.mealFatGPerServing,
					},
					autoCreated: false,
				};
			}
		}
		return { entry: preferred, autoCreated: false };
	}

	const created = await addEntry(env.DB, organizationId, planId, {
		mealId: input.mealId,
		date: input.date,
		slotType: input.slotType,
		servingsOverride: input.servingsOverride ?? null,
	});
	const mealMeta = await loadMealNutrition(env, organizationId, input.mealId);
	return {
		entry: {
			...created,
			...nutritionFields(mealMeta?.nutrition),
		},
		autoCreated: true,
	};
}

/**
 * Galley cook: when nutrition-cook-log-split is on and `date` is provided,
 * bridge onto Manifest; otherwise legacy cargo-only cook.
 */
export async function cookMealFromGalley(
	env: Env,
	organizationId: string,
	mealId: string,
	options: {
		flagContext: FlagshipEvaluationContext;
		servings?: number;
		confirmInsufficient?: boolean;
		userId?: string | null;
		source?: KitchenEventSource;
		/** Local calendar date YYYY-MM-DD — required to bridge. */
		date?: string;
		slotType?: string;
		localHour?: number;
	},
): Promise<GalleyCookResult> {
	const splitOn = await isFeatureEnabled(
		env,
		"nutrition-cook-log-split",
		options.flagContext,
	);

	if (!splitOn || !options.date) {
		const legacy = await cookMealWithConfirmation(env, organizationId, mealId, {
			servings: options.servings,
			confirmInsufficient: options.confirmInsufficient,
			userId: options.userId,
			source: options.source,
		});
		return {
			...legacy,
			bridgedToManifest: false,
			offerPersonalLog: false,
			autoCreated: false,
		};
	}

	const slotType = resolveManifestSlotType({
		slotType: options.slotType,
		localHour: options.localHour,
	});
	const plan = await ensureMealPlan(env.DB, organizationId);
	const { entry, autoCreated } = await resolveOrCreateGalleyCookEntry(
		env,
		organizationId,
		plan.id,
		{
			mealId,
			date: options.date,
			slotType,
			servingsOverride: options.servings ?? null,
		},
	);

	const cookResult = await cookManifestEntries(
		env,
		organizationId,
		plan.id,
		[entry.id],
		{
			confirmInsufficient: options.confirmInsufficient,
			userId: options.userId,
			source: options.source,
		},
	);

	const offerPersonalLog = await isFeatureEnabled(
		env,
		"nutrition-manifest",
		options.flagContext,
	);

	if (cookResult.requiresConfirmation) {
		// Avoid leaving an empty auto-created plan row if the user declines Cook anyway.
		if (autoCreated) {
			await deleteEntry(env.DB, organizationId, plan.id, entry.id);
		}
		return {
			cooked: false,
			deductions: [],
			requiresConfirmation: true,
			missingIngredients: cookResult.missingIngredients,
			bridgedToManifest: true,
			offerPersonalLog,
			autoCreated: false,
			planId: plan.id,
			entry: undefined,
			alreadyCookedIds: cookResult.alreadyCookedIds,
			eventIds: [],
		};
	}

	const preparedNow =
		cookResult.entryIds.includes(entry.id) ||
		cookResult.alreadyCookedIds.includes(entry.id);
	const nowIso = new Date().toISOString();
	const entrySummary = toEntrySummary({
		...entry,
		cookedAt: preparedNow ? (entry.cookedAt ?? new Date()) : entry.cookedAt,
		consumedAt: preparedNow
			? (entry.consumedAt ?? new Date())
			: entry.consumedAt,
	});
	if (preparedNow && !entrySummary.cookedAt) {
		entrySummary.cookedAt = nowIso;
		entrySummary.consumedAt = nowIso;
	}

	const didCook = cookResult.cooked > 0;
	return {
		cooked: didCook || cookResult.alreadyCookedIds.includes(entry.id),
		ingredientsDeducted: cookResult.deductions.length,
		servings: options.servings ?? entry.servingsOverride ?? entry.mealServings,
		deductions: cookResult.deductions,
		partialCook: cookResult.partialCook,
		skippedIngredients: cookResult.skippedIngredients,
		eventIds: cookResult.eventIds,
		bridgedToManifest: true,
		offerPersonalLog,
		autoCreated,
		planId: plan.id,
		entry: entrySummary,
		manifestEntryIds: didCook
			? cookResult.entryIds
			: cookResult.alreadyCookedIds.includes(entry.id)
				? [entry.id]
				: cookResult.entryIds,
		alreadyCookedIds: cookResult.alreadyCookedIds,
	};
}
