/**
 * Shared Manifest Cook — organization-scoped Cargo/preparation mutation.
 * Never writes personal nutrition. Dual-writes cookedAt + legacy consumedAt
 * during the mixed-fleet period so old clients see Done and cannot re-deduct.
 */

import { and, eq, inArray, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { meal, mealPlan, mealPlanEntry } from "~/db/schema";
import { buildCargoDeductionStatements } from "~/lib/cargo-deduction.server";
import {
	buildKitchenEventInserts,
	buildManifestCookedEvent,
} from "~/lib/kitchen-events.server";
import { getMealMissingIngredients } from "~/lib/matching.server";
import { type CargoDeduction, cookMeal } from "~/lib/meals.server";
import { bumpReadinessCacheVersions } from "~/lib/readiness-cache.server";
import type { KitchenEventSource } from "~/lib/schemas/kitchen-events";
import { trackD1BatchSize, trackWriteOperation } from "~/lib/telemetry.server";
import { mergeDeductions } from "~/lib/undo-token.server";

export type CookManifestEntriesResult = {
	cooked: number;
	entryIds: string[];
	planId: string;
	deductions: CargoDeduction[];
	eventIds: string[];
	alreadyCookedIds: string[];
	partialCook?: boolean;
	requiresConfirmation?: boolean;
	missingIngredients?: Array<{
		name: string;
		required: number;
		available: number;
		unit: string;
	}>;
	skippedIngredients?: Array<{
		name: string;
		required: number;
		available: number;
		unit: string;
	}>;
};

/**
 * Prepare Manifest entries: deduct Cargo once, set shared cooked state.
 * Idempotent for already-prepared entry IDs (returns them in alreadyCookedIds).
 */
export async function cookManifestEntries(
	env: Env,
	organizationId: string,
	planId: string,
	entryIds: string[],
	options?: {
		confirmInsufficient?: boolean;
		userId?: string | null;
		source?: KitchenEventSource;
	},
): Promise<CookManifestEntriesResult> {
	const d1 = drizzle(env.DB);

	const [plan] = await d1
		.select({ id: mealPlan.id })
		.from(mealPlan)
		.where(
			and(eq(mealPlan.id, planId), eq(mealPlan.organizationId, organizationId)),
		)
		.limit(1);

	if (!plan) throw new Error("Meal plan not found or unauthorized");

	const requested = [...new Set(entryIds)];

	const allMatching = await d1
		.select({
			id: mealPlanEntry.id,
			mealId: mealPlanEntry.mealId,
			date: mealPlanEntry.date,
			slotType: mealPlanEntry.slotType,
			servingsOverride: mealPlanEntry.servingsOverride,
			cookedAt: mealPlanEntry.cookedAt,
			consumedAt: mealPlanEntry.consumedAt,
			mealServings: meal.servings,
			mealName: meal.name,
		})
		.from(mealPlanEntry)
		.innerJoin(meal, eq(mealPlanEntry.mealId, meal.id))
		.where(
			and(
				eq(mealPlanEntry.planId, planId),
				eq(meal.organizationId, organizationId),
				inArray(mealPlanEntry.id, requested),
			),
		);

	const seen = new Set<string>();
	const uniqueRows = allMatching.filter((e) => {
		if (seen.has(e.id)) return false;
		seen.add(e.id);
		return true;
	});

	const alreadyCookedIds = uniqueRows
		.filter((e) => e.cookedAt != null || e.consumedAt != null)
		.map((e) => e.id);

	const uniqueEntries = uniqueRows.filter(
		(e) => e.cookedAt == null && e.consumedAt == null,
	);

	if (uniqueEntries.length === 0) {
		return {
			cooked: 0,
			deductions: [],
			entryIds: [],
			planId,
			eventIds: [],
			alreadyCookedIds,
		};
	}

	const servingsByMeal = new Map<string, number>();
	for (const entry of uniqueEntries) {
		const effectiveServings = entry.servingsOverride ?? entry.mealServings ?? 1;
		servingsByMeal.set(
			entry.mealId,
			(servingsByMeal.get(entry.mealId) ?? 0) + effectiveServings,
		);
	}

	if (!options?.confirmInsufficient) {
		const missingIngredients: CookManifestEntriesResult["missingIngredients"] =
			[];
		const seenNames = new Set<string>();
		for (const [mealId, totalServings] of servingsByMeal) {
			const shortfalls = await getMealMissingIngredients(
				env,
				organizationId,
				mealId,
				totalServings,
			);
			for (const item of shortfalls) {
				const key = item.name.toLowerCase();
				if (seenNames.has(key)) continue;
				seenNames.add(key);
				missingIngredients.push(item);
			}
		}
		if (missingIngredients.length > 0) {
			return {
				cooked: 0,
				deductions: [],
				entryIds: [],
				planId,
				requiresConfirmation: true,
				missingIngredients,
				eventIds: [],
				alreadyCookedIds,
			};
		}
	}

	const allDeductions: CargoDeduction[] = [];
	const skippedIngredients: NonNullable<
		CookManifestEntriesResult["skippedIngredients"]
	> = [];
	const seenSkipped = new Set<string>();
	let partialCook = false;
	const now = new Date();
	const cookedEntryIds: string[] = [];
	const allEventIds: string[] = [];

	const entriesByMeal = new Map<string, typeof uniqueEntries>();
	for (const entry of uniqueEntries) {
		const list = entriesByMeal.get(entry.mealId) ?? [];
		list.push(entry);
		entriesByMeal.set(entry.mealId, list);
	}

	for (const [mealId, totalServings] of servingsByMeal) {
		const mealEntries = entriesByMeal.get(mealId) ?? [];
		const mealEntryIds = mealEntries.map((e) => e.id);
		const mealName = mealEntries[0]?.mealName ?? "Unknown meal";
		const sharedDate = mealEntries.every((e) => e.date === mealEntries[0]?.date)
			? mealEntries[0]?.date
			: undefined;
		const sharedSlot = mealEntries.every(
			(e) => e.slotType === mealEntries[0]?.slotType,
		)
			? mealEntries[0]?.slotType
			: undefined;

		const cookResult = await cookMeal(env, organizationId, mealId, {
			servings: totalServings,
			deductionMode: options?.confirmInsufficient ? "partial" : "strict",
			skipApply: true,
		});
		mergeDeductions(allDeductions, cookResult.deductions);
		if (cookResult.partialCook && cookResult.skippedIngredients?.length) {
			partialCook = true;
			for (const item of cookResult.skippedIngredients) {
				const key = item.name.toLowerCase();
				if (seenSkipped.has(key)) continue;
				seenSkipped.add(key);
				skippedIngredients.push(item);
			}
		}

		const eventId = crypto.randomUUID();

		// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types are complex
		const stmts: any[] = await buildCargoDeductionStatements(
			d1,
			organizationId,
			cookResult.deductions,
		);
		stmts.push(
			d1
				.update(mealPlanEntry)
				.set({
					cookedAt: now,
					cookedByUserId: options?.userId ?? null,
					consumedAt: now,
				})
				.where(
					and(
						eq(mealPlanEntry.planId, planId),
						inArray(mealPlanEntry.id, mealEntryIds),
						isNull(mealPlanEntry.cookedAt),
						isNull(mealPlanEntry.consumedAt),
					),
				),
		);

		const { stmts: eventStmts, eventIds } = buildKitchenEventInserts(d1, [
			buildManifestCookedEvent({
				id: eventId,
				organizationId,
				userId: options?.userId,
				mealId,
				mealName,
				planId,
				entryIds: mealEntryIds,
				date: sharedDate,
				slotType: sharedSlot,
				servings: totalServings,
				deductions: cookResult.deductions,
				partialCook: cookResult.partialCook,
				source: options?.source,
				occurredAt: now,
			}),
		]);
		stmts.push(...eventStmts);
		allEventIds.push(...eventIds);

		trackD1BatchSize("cookManifestEntries", stmts.length, {
			organizationRef: organizationId,
		});
		await trackWriteOperation(
			"cookManifestEntries",
			// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types are complex
			() => d1.batch(stmts as [any, ...any[]]),
			{ organizationRef: organizationId },
		);
		cookedEntryIds.push(...mealEntryIds);
	}

	if (allDeductions.length > 0) {
		await bumpReadinessCacheVersions(env.RATION_KV, organizationId);
	}

	return {
		cooked: cookedEntryIds.length,
		deductions: allDeductions,
		entryIds: cookedEntryIds,
		planId,
		partialCook: partialCook || undefined,
		skippedIngredients:
			skippedIngredients.length > 0 ? skippedIngredients : undefined,
		eventIds: allEventIds,
		alreadyCookedIds,
	};
}

/** True when an entry is prepared (Cook complete or legacy consume). */
export function isManifestEntryPrepared(entry: {
	cookedAt?: Date | string | null;
	consumedAt?: Date | string | null;
}): boolean {
	return entry.cookedAt != null || entry.consumedAt != null;
}

/** Effective prepared timestamp for clients (prefer cookedAt). */
export function effectiveCookedAt(entry: {
	cookedAt?: Date | string | null;
	consumedAt?: Date | string | null;
}): Date | string | null {
	return entry.cookedAt ?? entry.consumedAt ?? null;
}

/** Entries still eligible for Cook (neither cooked nor legacy-consumed). */
export function uncookedEntryFilter() {
	return and(isNull(mealPlanEntry.cookedAt), isNull(mealPlanEntry.consumedAt));
}
