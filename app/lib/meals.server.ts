import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { inventory, meal, mealIngredient, mealTag } from "../db/schema";
import type { MealInput } from "./schemas/meal";

export async function getMeals(db: D1Database, userId: string, tag?: string) {
	const d1 = drizzle(db);
	const query = d1
		.select()
		.from(meal)
		.where(eq(meal.userId, userId))
		.orderBy(desc(meal.createdAt));

	if (tag) {
		const mealIdsWithTag = await d1
			.select({ mealId: mealTag.mealId })
			.from(mealTag)
			.where(eq(mealTag.tag, tag));

		if (mealIdsWithTag.length === 0) return [];

		const ids = mealIdsWithTag.map((r) => r.mealId);
		return await d1
			.select()
			.from(meal)
			.where(and(eq(meal.userId, userId), inArray(meal.id, ids)))
			.orderBy(desc(meal.createdAt));
	}

	return await query;
}

export async function getMeal(db: D1Database, userId: string, mealId: string) {
	const d1 = drizzle(db);
	const [foundMeal] = await d1
		.select()
		.from(meal)
		.where(and(eq(meal.id, mealId), eq(meal.userId, userId)));

	if (!foundMeal) return null;

	const ingredients = await d1
		.select()
		.from(mealIngredient)
		.where(eq(mealIngredient.mealId, mealId))
		.orderBy(mealIngredient.orderIndex);

	const tags = await d1
		.select()
		.from(mealTag)
		.where(eq(mealTag.mealId, mealId));

	return {
		...foundMeal,
		ingredients,
		tags: tags.map((t) => t.tag),
	};
}

export async function createMeal(
	db: D1Database,
	userId: string,
	data: MealInput,
) {
	const d1 = drizzle(db);
	const mealId = crypto.randomUUID();

	await d1.insert(meal).values({
		id: mealId,
		userId,
		name: data.name,
		description: data.description,
		directions: data.directions,
		equipment: data.equipment,
		servings: data.servings,
		prepTime: data.prepTime,
		cookTime: data.cookTime,
		customFields: data.customFields || {},
	});

	if (data.ingredients.length > 0) {
		await d1.insert(mealIngredient).values(
			data.ingredients.map((ing, idx) => ({
				mealId,
				inventoryId: ing.inventoryId,
				ingredientName: ing.ingredientName,
				quantity: ing.quantity,
				unit: ing.unit,
				isOptional: ing.isOptional,
				orderIndex: idx,
			})),
		);
	}

	if (data.tags.length > 0) {
		await d1.insert(mealTag).values(
			data.tags.map((tag) => ({
				mealId,
				tag,
			})),
		);
	}

	return await getMeal(db, userId, mealId);
}

export async function updateMeal(
	db: D1Database,
	userId: string,
	mealId: string,
	data: MealInput,
) {
	const d1 = drizzle(db);

	// Verify ownership
	const [existing] = await d1
		.select()
		.from(meal)
		.where(and(eq(meal.id, mealId), eq(meal.userId, userId)));

	if (!existing) throw new Error("Meal not found or unauthorized");

	// Update meal details
	await d1
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
		.where(eq(meal.id, mealId));

	// Replace ingredients
	await d1.delete(mealIngredient).where(eq(mealIngredient.mealId, mealId));
	if (data.ingredients.length > 0) {
		await d1.insert(mealIngredient).values(
			data.ingredients.map((ing, idx) => ({
				mealId,
				inventoryId: ing.inventoryId,
				ingredientName: ing.ingredientName,
				quantity: ing.quantity,
				unit: ing.unit,
				isOptional: ing.isOptional,
				orderIndex: idx,
			})),
		);
	}

	// Replace tags
	await d1.delete(mealTag).where(eq(mealTag.mealId, mealId));
	if (data.tags.length > 0) {
		await d1.insert(mealTag).values(
			data.tags.map((tag) => ({
				mealId,
				tag,
			})),
		);
	}

	return await getMeal(db, userId, mealId);
}

export async function deleteMeal(
	db: D1Database,
	userId: string,
	mealId: string,
) {
	const d1 = drizzle(db);
	return await d1
		.delete(meal)
		.where(and(eq(meal.id, mealId), eq(meal.userId, userId)));
}

export async function cookMeal(db: D1Database, userId: string, mealId: string) {
	const d1 = drizzle(db);

	// Get meal ingredients
	const ingredients = await d1
		.select()
		.from(mealIngredient)
		.where(eq(mealIngredient.mealId, mealId));

	// Deduct from inventory where linked
	const updates = ingredients
		.filter((ing) => ing.inventoryId)
		.map((ing) => {
			return d1
				.update(inventory)
				.set({
					quantity: sql`${inventory.quantity} - ${ing.quantity}`,
				})
				.where(
					and(
						eq(inventory.id, ing.inventoryId as string),
						eq(inventory.userId, userId),
					),
				);
		});

	if (updates.length > 0) {
		await d1.batch(updates as [any, ...any[]]);
	}

	return { cooked: true, ingredientsDeducted: updates.length };
}
