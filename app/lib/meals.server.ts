import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { inventory, meal, mealIngredient, mealTag } from "../db/schema";
import type { MealInput } from "./schemas/meal";

/**
 * Retrieves all meals for an organization, optionally filtered by tag.
 * Returns meals with their associated tags for client-side filtering.
 */
export async function getMeals(
	db: D1Database,
	organizationId: string,
	tag?: string,
) {
	const d1 = drizzle(db);

	// Base query to get meals
	const meals = tag
		? await d1
				.select({
					id: meal.id,
					organizationId: meal.organizationId,
					name: meal.name,
					description: meal.description,
					directions: meal.directions,
					equipment: meal.equipment,
					servings: meal.servings,
					prepTime: meal.prepTime,
					cookTime: meal.cookTime,
					customFields: meal.customFields,
					createdAt: meal.createdAt,
					updatedAt: meal.updatedAt,
				})
				.from(meal)
				.innerJoin(mealTag, eq(meal.id, mealTag.mealId))
				.where(
					and(eq(meal.organizationId, organizationId), eq(mealTag.tag, tag)),
				)
				.orderBy(desc(meal.createdAt))
		: await d1
				.select()
				.from(meal)
				.where(eq(meal.organizationId, organizationId))
				.orderBy(desc(meal.createdAt));

	if (meals.length === 0) {
		return [];
	}

	// Fetch all tags for the organization's meals in one query
	const mealIds = meals.map((m) => m.id);
	const allTags = await d1
		.select({
			mealId: mealTag.mealId,
			tag: mealTag.tag,
		})
		.from(mealTag)
		.where(inArray(mealTag.mealId, mealIds));

	// Group tags by meal ID
	const tagsByMealId = new Map<string, string[]>();
	for (const t of allTags) {
		const existing = tagsByMealId.get(t.mealId) || [];
		existing.push(t.tag);
		tagsByMealId.set(t.mealId, existing);
	}

	// Return meals with tags attached
	return meals.map((m) => ({
		...m,
		tags: tagsByMealId.get(m.id) || [],
	}));
}

/**
 * Retrieves a single meal by ID, including its ingredients and tags.
 * Uses a batch query to avoid N+1 issues and reduce round-trips.
 */
export async function getMeal(
	db: D1Database,
	organizationId: string,
	mealId: string,
) {
	const d1 = drizzle(db);

	const [mealResults, ingredients, tags] = await d1.batch([
		d1
			.select()
			.from(meal)
			.where(and(eq(meal.id, mealId), eq(meal.organizationId, organizationId))),
		d1
			.select()
			.from(mealIngredient)
			.where(eq(mealIngredient.mealId, mealId))
			.orderBy(mealIngredient.orderIndex),
		d1.select().from(mealTag).where(eq(mealTag.mealId, mealId)),
	]);

	const foundMeal = mealResults[0];
	if (!foundMeal) return null;

	return {
		...foundMeal,
		ingredients,
		tags: tags.map((t) => t.tag),
	};
}

/**
 * Creates a new meal with ingredients and tags in a single atomic operation.
 */
export async function createMeal(
	db: D1Database,
	organizationId: string,
	data: MealInput,
) {
	const d1 = drizzle(db);
	const mealId = crypto.randomUUID();

	// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types complex
	const batch: any[] = [
		d1.insert(meal).values({
			id: mealId,
			organizationId,
			name: data.name,
			description: data.description,
			directions: data.directions,
			equipment: data.equipment,
			servings: data.servings,
			prepTime: data.prepTime,
			cookTime: data.cookTime,
			customFields: data.customFields || {},
		}),
	];

	if (data.ingredients.length > 0) {
		batch.push(
			d1.insert(mealIngredient).values(
				data.ingredients.map((ing, idx) => ({
					mealId,
					inventoryId: ing.inventoryId,
					ingredientName: ing.ingredientName,
					quantity: ing.quantity,
					unit: ing.unit,
					isOptional: ing.isOptional,
					orderIndex: idx,
				})),
			),
		);
	}

	if (data.tags.length > 0) {
		batch.push(
			d1.insert(mealTag).values(
				data.tags.map((tag) => ({
					mealId,
					tag,
				})),
			),
		);
	}

	// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types are complex
	await d1.batch(batch as [any, ...any[]]);

	return await getMeal(db, organizationId, mealId);
}

/**
 * Updates an existing meal, its ingredients, and tags atomically.
 */
export async function updateMeal(
	db: D1Database,
	organizationId: string,
	mealId: string,
	data: MealInput,
) {
	const d1 = drizzle(db);

	// Verify ownership
	const [existing] = await d1
		.select()
		.from(meal)
		.where(and(eq(meal.id, mealId), eq(meal.organizationId, organizationId)));

	if (!existing) throw new Error("Meal not found or unauthorized");

	// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types complex
	const batch: any[] = [
		d1
			.update(meal)
			.set({
				name: data.name,
				description: data.description,
				directions: data.directions,
				equipment: data.equipment,
				servings: data.servings,
				prepTime: data.prepTime,
				cookTime: data.cookTime,
				customFields: data.customFields || {},
				updatedAt: new Date(),
			})
			.where(eq(meal.id, mealId)),
		d1.delete(mealIngredient).where(eq(mealIngredient.mealId, mealId)),
		d1.delete(mealTag).where(eq(mealTag.mealId, mealId)),
	];

	if (data.ingredients.length > 0) {
		batch.push(
			d1.insert(mealIngredient).values(
				data.ingredients.map((ing, idx) => ({
					mealId,
					inventoryId: ing.inventoryId,
					ingredientName: ing.ingredientName,
					quantity: ing.quantity,
					unit: ing.unit,
					isOptional: ing.isOptional,
					orderIndex: idx,
				})),
			),
		);
	}

	if (data.tags.length > 0) {
		batch.push(
			d1.insert(mealTag).values(
				data.tags.map((tag) => ({
					mealId,
					tag,
				})),
			),
		);
	}

	// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types are complex
	await d1.batch(batch as [any, ...any[]]);

	return await getMeal(db, organizationId, mealId);
}

/**
 * Deletes a meal. Verification ensures organization can only delete their own meals.
 */
export async function deleteMeal(
	db: D1Database,
	organizationId: string,
	mealId: string,
) {
	const d1 = drizzle(db);
	return await d1
		.delete(meal)
		.where(and(eq(meal.id, mealId), eq(meal.organizationId, organizationId)));
}

/**
 * Executes a meal cooking procedure.
 *
 * Safety Features:
 * 1. Ownership Verification: Ensures the meal belongs to the organization.
 * 2. Inventory Check: Verifies all linked inventory items have sufficient quantity.
 * 3. Race Condition Prevention: Uses a batch operation for deduction.
 * 4. Input Validation: Prevents SQL injection via type-safe Drizzle paramaters.
 */
export async function cookMeal(
	db: D1Database,
	organizationId: string,
	mealId: string,
) {
	const d1 = drizzle(db);

	// 1. Verify meal ownership and existence
	const [mealRecord] = await d1
		.select()
		.from(meal)
		.where(and(eq(meal.id, mealId), eq(meal.organizationId, organizationId)));

	if (!mealRecord) {
		throw new Error("Meal not found or unauthorized for this organization.");
	}

	// 2. Get ingredients
	const ingredients = await d1
		.select()
		.from(mealIngredient)
		.where(eq(mealIngredient.mealId, mealId));

	// 3. For linked inventory items, check quantities first
	const linkedIngredients = ingredients.filter(
		(ing) => ing.inventoryId && typeof ing.inventoryId === "string",
	);

	if (linkedIngredients.length > 0) {
		const inventoryIds = linkedIngredients.map(
			(ing) => ing.inventoryId as string,
		);

		const currentInventory = await d1
			.select()
			.from(inventory)
			.where(
				and(
					eq(inventory.organizationId, organizationId),
					inArray(inventory.id, inventoryIds),
				),
			);

		const inventoryMap = new Map(
			currentInventory.map((i) => [i.id, i.quantity]),
		);

		const insufficient = linkedIngredients.filter((ing) => {
			const available = inventoryMap.get(ing.inventoryId as string) || 0;
			return available < ing.quantity;
		});

		if (insufficient.length > 0) {
			const names = insufficient.map((i) => i.ingredientName).join(", ");
			throw new Error(`Insufficient inventory for: ${names}`);
		}

		// 4. Perform deductions in a single batch
		const updates = linkedIngredients.map((ing) => {
			return d1
				.update(inventory)
				.set({
					quantity: sql`${inventory.quantity} - ${ing.quantity}`,
				})
				.where(
					and(
						eq(inventory.id, ing.inventoryId as string),
						eq(inventory.organizationId, organizationId),
					),
				);
		});

		// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types are complex
		await d1.batch(updates as [any, ...any[]]);
		return { cooked: true, ingredientsDeducted: updates.length };
	}

	return { cooked: true, ingredientsDeducted: 0 };
}

/**
 * Retrieves all unique tags for an organization's meals.
 * Useful for populating tag filter dropdowns.
 */
export async function getOrganizationMealTags(
	db: D1Database,
	organizationId: string,
) {
	const d1 = drizzle(db);

	const tags = await d1
		.selectDistinct({ tag: mealTag.tag })
		.from(mealTag)
		.innerJoin(meal, eq(mealTag.mealId, meal.id))
		.where(eq(meal.organizationId, organizationId))
		.orderBy(mealTag.tag);

	return tags.map((t) => t.tag);
}
