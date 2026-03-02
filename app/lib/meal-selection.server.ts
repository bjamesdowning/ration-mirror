import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { activeMealSelection, meal } from "../db/schema";

export async function getActiveMealSelections(
	db: D1Database,
	organizationId: string,
) {
	const d1 = drizzle(db);
	return await d1
		.select()
		.from(activeMealSelection)
		.where(eq(activeMealSelection.organizationId, organizationId));
}

export async function toggleMealSelection(
	db: D1Database,
	organizationId: string,
	mealId: string,
) {
	const d1 = drizzle(db);

	const [existing] = await d1
		.select()
		.from(activeMealSelection)
		.where(
			and(
				eq(activeMealSelection.organizationId, organizationId),
				eq(activeMealSelection.mealId, mealId),
			),
		);

	if (existing) {
		await d1
			.delete(activeMealSelection)
			.where(eq(activeMealSelection.id, existing.id));
		return { isActive: false };
	}

	await d1.insert(activeMealSelection).values({
		organizationId,
		mealId,
	});

	return { isActive: true };
}

/**
 * Selects a meal and persists a servings override in one operation.
 * If the meal is already selected, only the servingsOverride is updated.
 * If servingsOverride is null or undefined, the stored override is cleared.
 */
export async function upsertMealSelection(
	db: D1Database,
	organizationId: string,
	mealId: string,
	servingsOverride?: number | null,
) {
	const d1 = drizzle(db);

	const [existing] = await d1
		.select()
		.from(activeMealSelection)
		.where(
			and(
				eq(activeMealSelection.organizationId, organizationId),
				eq(activeMealSelection.mealId, mealId),
			),
		);

	if (existing) {
		await d1
			.update(activeMealSelection)
			.set({ servingsOverride: servingsOverride ?? null })
			.where(eq(activeMealSelection.id, existing.id));
		return { isActive: true, servingsOverride: servingsOverride ?? null };
	}

	await d1.insert(activeMealSelection).values({
		organizationId,
		mealId,
		servingsOverride: servingsOverride ?? null,
	});

	return { isActive: true, servingsOverride: servingsOverride ?? null };
}

export async function clearMealSelections(
	db: D1Database,
	organizationId: string,
) {
	const d1 = drizzle(db);
	const selections = await d1
		.select({ id: activeMealSelection.id })
		.from(activeMealSelection)
		.where(eq(activeMealSelection.organizationId, organizationId));

	if (selections.length === 0) {
		return { cleared: 0 };
	}

	await d1
		.delete(activeMealSelection)
		.where(eq(activeMealSelection.organizationId, organizationId));

	return { cleared: selections.length };
}

export async function validateMealOwnership(
	db: D1Database,
	organizationId: string,
	mealId: string,
) {
	const d1 = drizzle(db);
	const [record] = await d1
		.select({ id: meal.id })
		.from(meal)
		.where(and(eq(meal.id, mealId), eq(meal.organizationId, organizationId)));

	return Boolean(record);
}
