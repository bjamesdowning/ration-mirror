import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { meal, mealPlan, mealPlanEntry, member, user } from "../db/schema";
import { log } from "./logging.server";
import { cookMeal } from "./meals.server";
import type { ManifestPreviewData } from "./types";

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
}

export interface ConsumeManifestEntriesResult {
	consumed: number;
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
	})) as MealPlanEntryWithMeal[];
}

// ---------------------------------------------------------------------------
// Consume entries (deduct ingredients from Cargo, mark as consumed)
// ---------------------------------------------------------------------------

export async function consumeManifestEntries(
	db: D1Database,
	organizationId: string,
	planId: string,
	entryIds: string[],
): Promise<ConsumeManifestEntriesResult> {
	const d1 = drizzle(db);

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

	if (uniqueEntries.length === 0) return { consumed: 0 };

	// 3. Cook each meal (deducts ingredients); first failure throws
	for (const entry of uniqueEntries) {
		const effectiveServings = entry.servingsOverride ?? entry.mealServings ?? 1;
		await cookMeal(db, organizationId, entry.mealId, {
			servings: effectiveServings,
		});
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

	return { consumed: uniqueEntries.length };
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
		notes?: string;
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
 * Returns one row per meal_plan_entry occurrence in the current week.
 * Used by supply.server.ts to merge Manifest meals with Galley selections.
 * Returns [] if no active plan or no entries in the current week.
 */
export async function getManifestWeekMealsForSupply(
	db: D1Database,
	organizationId: string,
	weekStart: "sunday" | "monday" = "sunday",
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
	const startDate = getWeekStart(today, weekStart);
	const endDate = getWeekEnd(startDate);

	const rows = await d1
		.select({
			mealId: mealPlanEntry.mealId,
			servingsOverride: mealPlanEntry.servingsOverride,
		})
		.from(mealPlanEntry)
		.where(
			and(
				eq(mealPlanEntry.planId, plan.id),
				gte(mealPlanEntry.date, startDate),
				lte(mealPlanEntry.date, endDate),
			),
		);

	return rows;
}

// ---------------------------------------------------------------------------
// Hub widget preview
// ---------------------------------------------------------------------------

/**
 * Lightweight query for the Hub ManifestWidget.
 * Returns at most 28 rows (4 slots × 7 days) via a single indexed scan.
 */
export async function getManifestPreview(
	db: D1Database,
	organizationId: string,
	days = 7,
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
			),
		)
		.orderBy(
			mealPlanEntry.date,
			mealPlanEntry.slotType,
			mealPlanEntry.orderIndex,
		);

	return { planId: plan.id, entries: rows };
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

	return rows.map((r) => ({
		...r,
		servings: r.servings ?? 1,
		tags: [],
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
