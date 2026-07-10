import {
	and,
	asc,
	eq,
	gte,
	inArray,
	isNull,
	lte,
	notInArray,
} from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import {
	meal,
	mealIngredient,
	mealPlan,
	mealPlanEntry,
	mealTag,
	member,
	tag,
	user,
} from "../db/schema";
import { type AllergenSlug, detectAllergens } from "./allergens";
import { log } from "./logging.server";
import { getExcludedManifestDates } from "./manifest-supply.server";
import { getMealMissingIngredients } from "./matching.server";
import { type CargoDeduction, cookMeal } from "./meals.server";
import { chunkedQuery } from "./query-utils.server";
import { getTagsForMealIds, tagsToSlugs } from "./tags.server";
import type { ManifestPreviewData } from "./types";
import { mergeDeductions } from "./undo-token.server";

const SHARE_TOKEN_EXPIRY_DAYS = 7;
const SHARE_TOKEN_EXPIRY_SECONDS = SHARE_TOKEN_EXPIRY_DAYS * 24 * 60 * 60;

// ---------------------------------------------------------------------------
// Date utilities (shared with client via ~/lib/manifest-dates)
// ---------------------------------------------------------------------------

import {
	getTodayISO as getTodayISOShared,
	getWeekDates as getWeekDatesShared,
	getWeekEnd as getWeekEndShared,
	getWeekStart as getWeekStartShared,
	toISODateString as toISODateStringShared,
} from "./manifest-dates";

export const getTodayISO = getTodayISOShared;
export const getWeekStart = getWeekStartShared;
export const getWeekEnd = getWeekEndShared;
export const toISODateString = toISODateStringShared;
export const getWeekDates = getWeekDatesShared;

// ---------------------------------------------------------------------------
// Plan management
// ---------------------------------------------------------------------------

export interface MealPlanRow {
	id: string;
	organizationId: string;
	name: string;
	shareToken: string | null;
	shareExpiresAt: Date | null;
	isArchived: boolean;
	createdAt: Date;
	updatedAt: Date;
}

/**
 * Returns the active (non-archived) meal plan for an org, creating one if it
 * doesn't exist yet. Mirrors the ensureSupplyList singleton pattern.
 */
export async function ensureMealPlan(
	db: D1Database,
	organizationId: string,
): Promise<MealPlanRow> {
	const d1 = drizzle(db);

	const existing = await d1
		.select()
		.from(mealPlan)
		.where(
			and(
				eq(mealPlan.organizationId, organizationId),
				eq(mealPlan.isArchived, false),
			),
		)
		.limit(1);

	if (existing[0]) return existing[0] as MealPlanRow;

	const [created] = await d1
		.insert(mealPlan)
		.values({
			organizationId,
			name: "Meal Plan",
		})
		.returning();

	if (!created) throw new Error("Failed to create meal plan");
	return created as MealPlanRow;
}

export async function getMealPlan(
	db: D1Database,
	organizationId: string,
): Promise<MealPlanRow | null> {
	const d1 = drizzle(db);
	const [row] = await d1
		.select()
		.from(mealPlan)
		.where(
			and(
				eq(mealPlan.organizationId, organizationId),
				eq(mealPlan.isArchived, false),
			),
		)
		.limit(1);
	return (row as MealPlanRow) ?? null;
}

export async function getMealPlanById(
	db: D1Database,
	organizationId: string,
	planId: string,
): Promise<MealPlanRow | null> {
	const d1 = drizzle(db);
	const [row] = await d1
		.select()
		.from(mealPlan)
		.where(
			and(eq(mealPlan.id, planId), eq(mealPlan.organizationId, organizationId)),
		)
		.limit(1);
	return (row as MealPlanRow) ?? null;
}

// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------

export interface MealPlanEntryWithMeal {
	id: string;
	planId: string;
	mealId: string;
	date: string;
	slotType: string;
	orderIndex: number;
	servingsOverride: number | null;
	notes: string | null;
	consumedAt: Date | null;
	createdAt: Date;
	mealName: string;
	mealServings: number;
	mealType: string;
	mealPrepTime: number | null;
	mealCookTime: number | null;
	mealTags?: string[];
}

export interface ConsumeManifestEntriesResult {
	consumed: number;
	deductions: CargoDeduction[];
	entryIds: string[];
	planId: string;
	requiresConfirmation?: boolean;
	missingIngredients?: Array<{
		name: string;
		required: number;
		available: number;
		unit: string;
	}>;
	partialCook?: boolean;
	skippedIngredients?: Array<{
		name: string;
		required: number;
		available: number;
		unit: string;
	}>;
}

export async function getWeekEntries(
	db: D1Database,
	planId: string,
	startDate: string,
	endDate: string,
): Promise<MealPlanEntryWithMeal[]> {
	const d1 = drizzle(db);

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
			createdAt: mealPlanEntry.createdAt,
			mealName: meal.name,
			mealServings: meal.servings,
			mealType: meal.type,
			mealPrepTime: meal.prepTime,
			mealCookTime: meal.cookTime,
		})
		.from(mealPlanEntry)
		.innerJoin(meal, eq(mealPlanEntry.mealId, meal.id))
		.where(
			and(
				eq(mealPlanEntry.planId, planId),
				gte(mealPlanEntry.date, startDate),
				lte(mealPlanEntry.date, endDate),
			),
		)
		.orderBy(
			mealPlanEntry.date,
			mealPlanEntry.slotType,
			mealPlanEntry.orderIndex,
		);

	return rows.map((r) => ({
		...r,
		consumedAt: r.consumedAt ?? null,
		mealServings: r.mealServings ?? 1,
		mealType: r.mealType ?? "recipe",
		mealPrepTime: r.mealPrepTime ?? null,
		mealCookTime: r.mealCookTime ?? null,
	})) as MealPlanEntryWithMeal[];
}

async function attachMealTagsToEntries(
	db: D1Database,
	entries: MealPlanEntryWithMeal[],
): Promise<MealPlanEntryWithMeal[]> {
	if (entries.length === 0) return entries;
	const mealIds = [...new Set(entries.map((e) => e.mealId))];
	const tagsByMealId = await getTagsForMealIds(db, mealIds);
	return entries.map((entry) => ({
		...entry,
		mealTags: tagsToSlugs(tagsByMealId.get(entry.mealId) ?? []),
	}));
}

export async function getWeekEntriesWithTags(
	db: D1Database,
	planId: string,
	startDate: string,
	endDate: string,
): Promise<MealPlanEntryWithMeal[]> {
	const entries = await getWeekEntries(db, planId, startDate, endDate);
	return attachMealTagsToEntries(db, entries);
}

// ---------------------------------------------------------------------------
// Consume entries (deduct ingredients from Cargo, mark as consumed)
// ---------------------------------------------------------------------------

export async function consumeManifestEntries(
	env: Env,
	organizationId: string,
	planId: string,
	entryIds: string[],
	options?: { confirmInsufficient?: boolean },
): Promise<ConsumeManifestEntriesResult> {
	const d1 = drizzle(env.DB);

	// 1. Verify plan belongs to org
	const [plan] = await d1
		.select({ id: mealPlan.id })
		.from(mealPlan)
		.where(
			and(eq(mealPlan.id, planId), eq(mealPlan.organizationId, organizationId)),
		)
		.limit(1);

	if (!plan) throw new Error("Meal plan not found or unauthorized");

	// 2. Load entries with meal data (only unconsumed, belonging to plan)
	const entries = await d1
		.select({
			id: mealPlanEntry.id,
			mealId: mealPlanEntry.mealId,
			servingsOverride: mealPlanEntry.servingsOverride,
			mealServings: meal.servings,
		})
		.from(mealPlanEntry)
		.innerJoin(meal, eq(mealPlanEntry.mealId, meal.id))
		.where(
			and(
				eq(mealPlanEntry.planId, planId),
				eq(meal.organizationId, organizationId),
				inArray(mealPlanEntry.id, entryIds),
				isNull(mealPlanEntry.consumedAt),
			),
		);

	// Dedupe by entry id (inArray can repeat)
	const seen = new Set<string>();
	const uniqueEntries = entries.filter((e) => {
		if (seen.has(e.id)) return false;
		seen.add(e.id);
		return true;
	});

	if (uniqueEntries.length === 0) {
		return { consumed: 0, deductions: [], entryIds: [], planId };
	}

	// 3. Cook each unique meal once with aggregated servings. Entries for the
	//    same mealId are combined so we call cookMeal M times (unique meals)
	//    instead of N times (entries). The deduction is linear in servings so
	//    summing is equivalent to individual calls. Sequential execution is
	//    required because each cookMeal reads current inventory quantities.
	const servingsByMeal = new Map<string, number>();
	for (const entry of uniqueEntries) {
		const effectiveServings = entry.servingsOverride ?? entry.mealServings ?? 1;
		servingsByMeal.set(
			entry.mealId,
			(servingsByMeal.get(entry.mealId) ?? 0) + effectiveServings,
		);
	}

	if (!options?.confirmInsufficient) {
		const missingIngredients: ConsumeManifestEntriesResult["missingIngredients"] =
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
				consumed: 0,
				deductions: [],
				entryIds: [],
				planId,
				requiresConfirmation: true,
				missingIngredients,
			};
		}
	}

	const allDeductions: CargoDeduction[] = [];
	const skippedIngredients: ConsumeManifestEntriesResult["skippedIngredients"] =
		[];
	const seenSkipped = new Set<string>();
	let partialCook = false;

	for (const [mealId, totalServings] of servingsByMeal) {
		const cookResult = await cookMeal(env, organizationId, mealId, {
			servings: totalServings,
			deductionMode: options?.confirmInsufficient ? "partial" : "strict",
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
	}

	// 4. Mark all as consumed
	const now = new Date();
	await d1
		.update(mealPlanEntry)
		.set({ consumedAt: now })
		.where(
			and(
				eq(mealPlanEntry.planId, planId),
				inArray(
					mealPlanEntry.id,
					uniqueEntries.map((e) => e.id),
				),
			),
		);

	return {
		consumed: uniqueEntries.length,
		deductions: allDeductions,
		entryIds: uniqueEntries.map((e) => e.id),
		planId,
		partialCook: partialCook || undefined,
		skippedIngredients:
			skippedIngredients.length > 0 ? skippedIngredients : undefined,
	};
}

export async function addEntry(
	db: D1Database,
	organizationId: string,
	planId: string,
	input: {
		mealId: string;
		date: string;
		slotType: string;
		orderIndex?: number;
		servingsOverride?: number | null;
		notes?: string | null;
	},
): Promise<MealPlanEntryWithMeal> {
	const d1 = drizzle(db);

	// Verify meal belongs to this org
	const [mealRow] = await d1
		.select({
			id: meal.id,
			name: meal.name,
			servings: meal.servings,
			type: meal.type,
		})
		.from(meal)
		.where(
			and(eq(meal.id, input.mealId), eq(meal.organizationId, organizationId)),
		)
		.limit(1);

	if (!mealRow) throw new Error("Meal not found or unauthorized");

	const [entry] = await d1
		.insert(mealPlanEntry)
		.values({
			planId,
			mealId: input.mealId,
			date: input.date,
			slotType: input.slotType,
			orderIndex: input.orderIndex ?? 0,
			servingsOverride: input.servingsOverride ?? null,
			notes: input.notes ?? null,
		})
		.returning();

	if (!entry) throw new Error("Failed to create entry");

	return {
		...entry,
		mealName: mealRow.name,
		mealServings: mealRow.servings ?? 1,
		mealType: mealRow.type ?? "recipe",
	} as MealPlanEntryWithMeal;
}

export async function updateEntry(
	db: D1Database,
	organizationId: string,
	planId: string,
	entryId: string,
	input: {
		date?: string;
		slotType?: string;
		orderIndex?: number;
		servingsOverride?: number | null;
		notes?: string | null;
	},
): Promise<MealPlanEntryWithMeal | null> {
	const d1 = drizzle(db);

	// Verify entry belongs to this plan
	const [existing] = await d1
		.select()
		.from(mealPlanEntry)
		.where(and(eq(mealPlanEntry.id, entryId), eq(mealPlanEntry.planId, planId)))
		.limit(1);

	if (!existing) return null;

	// Build update payload (only defined fields)
	const updatePayload: Partial<typeof mealPlanEntry.$inferInsert> = {};
	if (input.date !== undefined) updatePayload.date = input.date;
	if (input.slotType !== undefined) updatePayload.slotType = input.slotType;
	if (input.orderIndex !== undefined)
		updatePayload.orderIndex = input.orderIndex;
	if ("servingsOverride" in input)
		updatePayload.servingsOverride = input.servingsOverride ?? null;
	if ("notes" in input) updatePayload.notes = input.notes ?? null;

	const [updated] = await d1
		.update(mealPlanEntry)
		.set(updatePayload)
		.where(eq(mealPlanEntry.id, entryId))
		.returning();

	if (!updated) return null;

	// Fetch meal details for return
	const [mealRow] = await d1
		.select({ name: meal.name, servings: meal.servings, type: meal.type })
		.from(meal)
		.where(
			and(eq(meal.id, updated.mealId), eq(meal.organizationId, organizationId)),
		)
		.limit(1);

	return {
		...updated,
		mealName: mealRow?.name ?? "",
		mealServings: mealRow?.servings ?? 1,
		mealType: mealRow?.type ?? "recipe",
	} as MealPlanEntryWithMeal;
}

export async function deleteEntry(
	db: D1Database,
	organizationId: string,
	planId: string,
	entryId: string,
): Promise<boolean> {
	const d1 = drizzle(db);

	// Verify entry belongs to this plan (and plan belongs to org)
	const [plan] = await d1
		.select({ id: mealPlan.id })
		.from(mealPlan)
		.where(
			and(eq(mealPlan.id, planId), eq(mealPlan.organizationId, organizationId)),
		)
		.limit(1);

	if (!plan) return false;

	const result = await d1
		.delete(mealPlanEntry)
		.where(
			and(eq(mealPlanEntry.id, entryId), eq(mealPlanEntry.planId, planId)),
		);

	return (result.meta?.changes ?? 0) > 0;
}

export async function clearDay(
	db: D1Database,
	organizationId: string,
	planId: string,
	date: string,
): Promise<number> {
	const d1 = drizzle(db);

	const [plan] = await d1
		.select({ id: mealPlan.id })
		.from(mealPlan)
		.where(
			and(eq(mealPlan.id, planId), eq(mealPlan.organizationId, organizationId)),
		)
		.limit(1);

	if (!plan) return 0;

	const result = await d1
		.delete(mealPlanEntry)
		.where(and(eq(mealPlanEntry.planId, planId), eq(mealPlanEntry.date, date)));

	return result.meta?.changes ?? 0;
}

export async function copyDay(
	db: D1Database,
	organizationId: string,
	planId: string,
	sourceDate: string,
	targetDate: string,
): Promise<number> {
	const d1 = drizzle(db);

	const [plan] = await d1
		.select({ id: mealPlan.id })
		.from(mealPlan)
		.where(
			and(eq(mealPlan.id, planId), eq(mealPlan.organizationId, organizationId)),
		)
		.limit(1);

	if (!plan) return 0;

	const sourceEntries = await d1
		.select()
		.from(mealPlanEntry)
		.where(
			and(eq(mealPlanEntry.planId, planId), eq(mealPlanEntry.date, sourceDate)),
		);

	if (sourceEntries.length === 0) return 0;

	const newEntries = sourceEntries.map((e) => ({
		planId,
		mealId: e.mealId,
		date: targetDate,
		slotType: e.slotType,
		orderIndex: e.orderIndex,
		servingsOverride: e.servingsOverride,
		notes: e.notes,
	}));

	await d1.insert(mealPlanEntry).values(newEntries);
	return newEntries.length;
}

// ---------------------------------------------------------------------------
// Sharing
// ---------------------------------------------------------------------------

export async function generateShareToken(
	db: D1Database,
	organizationId: string,
	planId: string,
): Promise<{ shareToken: string; shareExpiresAt: Date }> {
	const d1 = drizzle(db);

	const [plan] = await d1
		.select({ id: mealPlan.id })
		.from(mealPlan)
		.where(
			and(eq(mealPlan.id, planId), eq(mealPlan.organizationId, organizationId)),
		)
		.limit(1);

	if (!plan) throw new Error("Meal plan not found or unauthorized");

	const shareToken = crypto.randomUUID().replace(/-/g, "");
	const shareExpiresAt = new Date(
		Date.now() + SHARE_TOKEN_EXPIRY_SECONDS * 1000,
	);

	await d1
		.update(mealPlan)
		.set({ shareToken, shareExpiresAt, updatedAt: new Date() })
		.where(eq(mealPlan.id, planId));

	return { shareToken, shareExpiresAt };
}

export async function revokeShareToken(
	db: D1Database,
	organizationId: string,
	planId: string,
): Promise<void> {
	const d1 = drizzle(db);

	const [plan] = await d1
		.select({ id: mealPlan.id })
		.from(mealPlan)
		.where(
			and(eq(mealPlan.id, planId), eq(mealPlan.organizationId, organizationId)),
		)
		.limit(1);

	if (!plan) throw new Error("Meal plan not found or unauthorized");

	await d1
		.update(mealPlan)
		.set({ shareToken: null, shareExpiresAt: null, updatedAt: new Date() })
		.where(eq(mealPlan.id, planId));
}

export interface SharedMealPlan {
	id: string;
	name: string;
	entries: Array<{
		id: string;
		date: string;
		slotType: string;
		orderIndex: number;
		servingsOverride: number | null;
		mealName: string;
		mealType?: string;
	}>;
}

export async function getMealPlanByShareToken(
	db: D1Database,
	token: string,
): Promise<SharedMealPlan | null> {
	const d1 = drizzle(db);

	const [plan] = await d1
		.select()
		.from(mealPlan)
		.where(eq(mealPlan.shareToken, token))
		.limit(1);

	if (!plan) return null;

	// Validate expiry
	if (plan.shareExpiresAt && new Date(plan.shareExpiresAt) < new Date()) {
		log.warn("[manifest] Share token expired", { planId: plan.id });
		return null;
	}

	// Fetch next 14 days of entries from today
	const today = getTodayISO();
	const endDate = (() => {
		const d = new Date(`${today}T00:00:00`);
		d.setDate(d.getDate() + 13);
		return toISODateString(d);
	})();

	const entries = await d1
		.select({
			id: mealPlanEntry.id,
			date: mealPlanEntry.date,
			slotType: mealPlanEntry.slotType,
			orderIndex: mealPlanEntry.orderIndex,
			servingsOverride: mealPlanEntry.servingsOverride,
			mealName: meal.name,
			mealType: meal.type,
		})
		.from(mealPlanEntry)
		.innerJoin(meal, eq(mealPlanEntry.mealId, meal.id))
		.where(
			and(
				eq(mealPlanEntry.planId, plan.id),
				gte(mealPlanEntry.date, today),
				lte(mealPlanEntry.date, endDate),
			),
		)
		.orderBy(
			mealPlanEntry.date,
			mealPlanEntry.slotType,
			mealPlanEntry.orderIndex,
		);

	return {
		id: plan.id,
		name: plan.name,
		entries: entries.map((e) => ({
			...e,
			mealType: e.mealType ?? "recipe",
		})),
	};
}

// ---------------------------------------------------------------------------
// Supply integration
// ---------------------------------------------------------------------------

export interface ManifestMealForSupply {
	mealId: string;
	servingsOverride: number | null;
}

/**
 * Returns one row per unconsumed meal_plan_entry occurrence in the current week.
 * Used by supply.server.ts to merge Manifest meals with Galley selections.
 * Consumed entries are excluded so they do not contribute to the supply list.
 * Returns [] if no active plan or no entries in the current week.
 */
export async function getManifestWeekMealsForSupply(
	db: D1Database,
	organizationId: string,
	window?: { startDate: string; endDate: string },
): Promise<ManifestMealForSupply[]> {
	const d1 = drizzle(db);

	const [plan] = await d1
		.select({ id: mealPlan.id })
		.from(mealPlan)
		.where(
			and(
				eq(mealPlan.organizationId, organizationId),
				eq(mealPlan.isArchived, false),
			),
		)
		.limit(1);

	if (!plan) return [];

	const today = getTodayISO();
	const startDate = window?.startDate ?? getWeekStart(today, "sunday");
	const endDate = window?.endDate ?? getWeekEnd(startDate);

	const excludedDates = await getExcludedManifestDates(
		db,
		organizationId,
		startDate,
		endDate,
	);

	const entryConditions = [
		eq(mealPlanEntry.planId, plan.id),
		gte(mealPlanEntry.date, startDate),
		lte(mealPlanEntry.date, endDate),
		isNull(mealPlanEntry.consumedAt),
	];
	if (excludedDates.length > 0) {
		entryConditions.push(notInArray(mealPlanEntry.date, excludedDates));
	}

	const rows = await d1
		.select({
			mealId: mealPlanEntry.mealId,
			servingsOverride: mealPlanEntry.servingsOverride,
		})
		.from(mealPlanEntry)
		.where(and(...entryConditions));

	return rows;
}

// ---------------------------------------------------------------------------
// Hub widget preview
// ---------------------------------------------------------------------------

/**
 * Lightweight query for the Hub ManifestWidget.
 * Returns at most 28 rows (4 slots × 7 days) via a single indexed scan.
 * @param slotType Optional slot filter (breakfast/lunch/dinner/snack). When provided,
 *   only entries for that slot are returned. Stored in the widget's filter config.
 */
export async function getManifestPreview(
	db: D1Database,
	organizationId: string,
	days = 7,
	slotType?: string,
	tags?: string[],
): Promise<ManifestPreviewData> {
	const d1 = drizzle(db);

	const [plan] = await d1
		.select({ id: mealPlan.id })
		.from(mealPlan)
		.where(
			and(
				eq(mealPlan.organizationId, organizationId),
				eq(mealPlan.isArchived, false),
			),
		)
		.limit(1);

	if (!plan) return { planId: null, entries: [] };

	const today = getTodayISO();
	const endDate = (() => {
		const d = new Date(`${today}T00:00:00`);
		d.setDate(d.getDate() + days - 1);
		return toISODateString(d);
	})();

	const rows = await d1
		.select({
			entryId: mealPlanEntry.id,
			date: mealPlanEntry.date,
			slotType: mealPlanEntry.slotType,
			mealName: meal.name,
			mealId: mealPlanEntry.mealId,
			mealType: meal.type,
			servingsOverride: mealPlanEntry.servingsOverride,
		})
		.from(mealPlanEntry)
		.innerJoin(meal, eq(mealPlanEntry.mealId, meal.id))
		.where(
			and(
				eq(mealPlanEntry.planId, plan.id),
				gte(mealPlanEntry.date, today),
				lte(mealPlanEntry.date, endDate),
				...(slotType ? [eq(mealPlanEntry.slotType, slotType)] : []),
			),
		)
		.orderBy(
			mealPlanEntry.date,
			mealPlanEntry.slotType,
			mealPlanEntry.orderIndex,
		);

	// Tag filter applied against the bounded preview window only. The distinct
	// meal IDs present in `rows` are capped by the date range (max ~14 days of
	// entries), so the follow-up `inArray` stays well under D1's 100-param limit.
	if (tags && tags.length > 0) {
		const previewMealIds = [...new Set(rows.map((r) => r.mealId))];
		if (previewMealIds.length === 0) {
			return { planId: plan.id, entries: [] };
		}
		const taggedRows = await chunkedQuery(previewMealIds, (chunk) =>
			d1
				.selectDistinct({ mealId: mealTag.mealId })
				.from(mealTag)
				.innerJoin(tag, eq(mealTag.tagId, tag.id))
				.where(and(inArray(mealTag.mealId, chunk), inArray(tag.slug, tags))),
		);
		const allowed = new Set(taggedRows.map((r) => r.mealId));
		return {
			planId: plan.id,
			entries: rows.filter((r) => allowed.has(r.mealId)),
		};
	}

	return { planId: plan.id, entries: rows };
}

/**
 * Returns the distinct set of meal tag slugs for an organisation.
 * Used to populate the tag chip selector in Hub widget filter panels.
 * Scoped to the org so users only see their own tags.
 * Capped at 200 distinct tags — well above any practical limit.
 */
export async function getDistinctMealTags(
	db: D1Database,
	organizationId: string,
): Promise<string[]> {
	const d1 = drizzle(db);

	const rows = await d1
		.selectDistinct({ slug: tag.slug })
		.from(mealTag)
		.innerJoin(tag, eq(mealTag.tagId, tag.id))
		.innerJoin(meal, eq(mealTag.mealId, meal.id))
		.where(eq(meal.organizationId, organizationId))
		.orderBy(asc(tag.slug))
		.limit(200);

	return rows.map((r) => r.slug);
}

// ---------------------------------------------------------------------------
// Meals list for picker (org's meals, lightweight)
// ---------------------------------------------------------------------------

export interface MealForPicker {
	id: string;
	name: string;
	servings: number;
	prepTime: number | null;
	cookTime: number | null;
	tags: string[];
	type: string;
}

export async function getMealsForPicker(
	db: D1Database,
	organizationId: string,
): Promise<MealForPicker[]> {
	const d1 = drizzle(db);

	const rows = await d1
		.select({
			id: meal.id,
			name: meal.name,
			servings: meal.servings,
			prepTime: meal.prepTime,
			cookTime: meal.cookTime,
			type: meal.type,
		})
		.from(meal)
		.where(eq(meal.organizationId, organizationId))
		.orderBy(meal.name);

	if (rows.length === 0) {
		return [];
	}

	// Batch-load tags via junction table
	const mealIds = rows.map((r) => r.id);
	const tagsByMealId = await getTagsForMealIds(db, mealIds);

	return rows.map((r) => ({
		...r,
		servings: r.servings ?? 1,
		tags: tagsToSlugs(tagsByMealId.get(r.id) ?? []),
		type: r.type ?? "recipe",
	}));
}

// ---------------------------------------------------------------------------
// Tier check helpers (canShareMealPlan)
// ---------------------------------------------------------------------------

export async function canShareMealPlan(
	db: D1Database,
	organizationId: string,
): Promise<boolean> {
	const d1 = drizzle(db);

	const [ownerRow] = await d1
		.select({ tier: user.tier, tierExpiresAt: user.tierExpiresAt })
		.from(member)
		.innerJoin(user, eq(member.userId, user.id))
		.where(
			and(eq(member.organizationId, organizationId), eq(member.role, "owner")),
		);

	if (!ownerRow) return false;

	const now = Date.now();
	const expiresAt = ownerRow.tierExpiresAt
		? new Date(ownerRow.tierExpiresAt)
		: null;
	const isExpired =
		ownerRow.tier === "crew_member" && expiresAt && expiresAt.getTime() <= now;

	return ownerRow.tier === "crew_member" && !isExpired;
}

// ---------------------------------------------------------------------------
// Allergen detection
// ---------------------------------------------------------------------------

/**
 * For each meal ID, return the subset of `userAllergens` that are triggered by
 * the meal's ingredients. Only queries D1 when both `mealIds` and `userAllergens`
 * are non-empty. The limit cap (30 ingredients per meal) keeps response size
 * bounded for large meals.
 */
export async function getTriggeredAllergens(
	db: D1Database,
	mealIds: string[],
	userAllergens: AllergenSlug[],
): Promise<Record<string, AllergenSlug[]>> {
	if (mealIds.length === 0 || userAllergens.length === 0) return {};

	const drizzleDb = drizzle(db);
	const ingredientRows = await drizzleDb
		.select({
			mealId: mealIngredient.mealId,
			name: mealIngredient.ingredientName,
		})
		.from(mealIngredient)
		.where(inArray(mealIngredient.mealId, mealIds))
		.limit(mealIds.length * 30);

	const ingredientsByMealId = new Map<string, string[]>();
	for (const row of ingredientRows) {
		const existing = ingredientsByMealId.get(row.mealId) ?? [];
		existing.push(row.name);
		ingredientsByMealId.set(row.mealId, existing);
	}

	const result: Record<string, AllergenSlug[]> = {};
	for (const mealId of mealIds) {
		const names = ingredientsByMealId.get(mealId) ?? [];
		const triggered = detectAllergens(names, userAllergens);
		if (triggered.length > 0) {
			result[mealId] = triggered;
		}
	}
	return result;
}
