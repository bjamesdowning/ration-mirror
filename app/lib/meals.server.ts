import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import {
	activeMealSelection,
	cargo,
	meal,
	mealIngredient,
	mealTag,
} from "../db/schema";
import { checkCapacity } from "./capacity.server";
import { normalizeForMatch } from "./matching";
import {
	chunkedQuery,
	D1_MAX_BOUND_PARAMS,
	D1_MAX_INGREDIENT_ROWS_PER_STATEMENT,
	D1_MAX_TAG_ROWS_PER_STATEMENT,
} from "./query-utils.server";
import { getScaleFactor, scaleQuantity } from "./scale.server";
import type {
	MealInput,
	ProvisionInput,
	ProvisionUpdateInput,
} from "./schemas/meal";
import { trackD1BatchSize, trackWriteOperation } from "./telemetry.server";
import {
	convertQuantity,
	getUnitMultiplier,
	type SupportedUnit,
	toSupportedUnit,
} from "./units";
import { findSimilarCargo, SIMILARITY_THRESHOLDS } from "./vector.server";

function chunk<T>(arr: T[], size: number): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < arr.length; i += size) {
		out.push(arr.slice(i, i + size));
	}
	return out;
}

/** Maximum number of meals allowed in a single batch create. */
export const MAX_BATCH_MEALS = 10;

/**
 * Retrieves meals for an organization, optionally filtered by tag or domain.
 * Returns meals with their associated tags and ingredients.
 *
 * Pagination: pass `limit` and `offset` for page/cursor-based loading.
 * Omit both to fetch all rows (needed by exports, galley import, and AI generation).
 */
export async function getMeals(
	db: D1Database,
	organizationId: string,
	tag?: string,
	domain?: (typeof meal.$inferSelect)["domain"],
	options?: { limit?: number; offset?: number },
) {
	const d1 = drizzle(db);
	const conditions = [eq(meal.organizationId, organizationId)];
	if (tag) {
		conditions.push(eq(mealTag.tag, tag));
	}
	if (domain) {
		conditions.push(eq(meal.domain, domain));
	}

	// Base query to get meals
	const meals = tag
		? await d1
				.select({
					id: meal.id,
					organizationId: meal.organizationId,
					name: meal.name,
					domain: meal.domain,
					type: meal.type,
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
				.where(and(...conditions))
				.orderBy(desc(meal.createdAt))
				.$dynamic()
				.limit(options?.limit ?? Number.MAX_SAFE_INTEGER)
				.offset(options?.offset ?? 0)
		: await d1
				.select()
				.from(meal)
				.where(and(...conditions))
				.orderBy(desc(meal.createdAt))
				.$dynamic()
				.limit(options?.limit ?? Number.MAX_SAFE_INTEGER)
				.offset(options?.offset ?? 0);

	if (meals.length === 0) {
		return [];
	}

	// Fetch all tags and ingredients for the organization's meals in one query each
	const mealIds = meals.map((m) => m.id);
	const [allTags, allIngredients] = await Promise.all([
		chunkedQuery(mealIds, (chunk) =>
			d1
				.select({
					mealId: mealTag.mealId,
					tag: mealTag.tag,
				})
				.from(mealTag)
				.where(inArray(mealTag.mealId, chunk)),
		),
		chunkedQuery(mealIds, (chunk) =>
			d1
				.select()
				.from(mealIngredient)
				.where(inArray(mealIngredient.mealId, chunk))
				.orderBy(mealIngredient.orderIndex),
		),
	]);

	// Group tags by meal ID
	const tagsByMealId = new Map<string, string[]>();
	for (const t of allTags) {
		const existing = tagsByMealId.get(t.mealId) || [];
		existing.push(t.tag);
		tagsByMealId.set(t.mealId, existing);
	}

	// Group ingredients by meal ID
	const ingredientsByMealId = new Map<
		string,
		(typeof mealIngredient.$inferSelect)[]
	>();
	for (const ing of allIngredients) {
		const existing = ingredientsByMealId.get(ing.mealId) || [];
		existing.push(ing);
		ingredientsByMealId.set(ing.mealId, existing);
	}

	// Return meals with tags and ingredients attached
	return meals.map((m) => ({
		...m,
		tags: tagsByMealId.get(m.id) || [],
		ingredients: ingredientsByMealId.get(m.id) || [],
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
 * Ingredient/tag inserts are chunked to respect D1's 100 bound-params-per-query limit.
 */
export async function createMeal(
	db: D1Database,
	organizationId: string,
	data: MealInput,
	env?: Env,
) {
	if (env) {
		const capacity = await checkCapacity(env, organizationId, "meals", 1);
		if (!capacity.allowed) {
			throw new Error(
				`capacity_exceeded:meals:${capacity.current}:${capacity.limit}`,
			);
		}
	}

	const d1 = drizzle(db);
	const mealId = crypto.randomUUID();

	// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types complex
	const batch: any[] = [
		d1.insert(meal).values({
			id: mealId,
			organizationId,
			name: data.name,
			domain: data.domain,
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
		let baseIndex = 0;
		for (const ingredientChunk of chunk(
			data.ingredients,
			D1_MAX_INGREDIENT_ROWS_PER_STATEMENT,
		)) {
			batch.push(
				d1.insert(mealIngredient).values(
					ingredientChunk.map((ing, i) => ({
						mealId,
						cargoId: ing.cargoId,
						ingredientName: ing.ingredientName,
						quantity: ing.quantity,
						unit: ing.unit,
						isOptional: ing.isOptional,
						orderIndex: baseIndex + i,
					})),
				),
			);
			baseIndex += ingredientChunk.length;
		}
	}

	if (data.tags.length > 0) {
		for (const tagChunk of chunk(data.tags, D1_MAX_TAG_ROWS_PER_STATEMENT)) {
			batch.push(
				d1.insert(mealTag).values(
					tagChunk.map((tag) => ({
						mealId,
						tag,
					})),
				),
			);
		}
	}

	trackD1BatchSize("createMeal", batch.length, {
		organizationRef: organizationId,
	});

	await trackWriteOperation(
		"createMeal",
		// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types are complex
		() => d1.batch(batch as [any, ...any[]]),
		{
			organizationRef: organizationId,
		},
	);

	return await getMeal(db, organizationId, mealId);
}

/**
 * Creates multiple meals in a single atomic batch. All-or-nothing.
 * Returns the created meals with ingredients and tags.
 */
export async function createMeals(
	db: D1Database,
	organizationId: string,
	inputs: MealInput[],
) {
	if (inputs.length === 0) return [];
	if (inputs.length > MAX_BATCH_MEALS) {
		throw new Error(
			`Batch size exceeds maximum of ${MAX_BATCH_MEALS} meals per request`,
		);
	}
	const d1 = drizzle(db);

	// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types complex
	const batch: any[] = [];
	const mealIds: string[] = [];

	for (const data of inputs) {
		const mealId = crypto.randomUUID();
		mealIds.push(mealId);

		batch.push(
			d1.insert(meal).values({
				id: mealId,
				organizationId,
				name: data.name,
				domain: data.domain,
				description: data.description,
				directions: data.directions,
				equipment: data.equipment,
				servings: data.servings,
				prepTime: data.prepTime,
				cookTime: data.cookTime,
				customFields: data.customFields || {},
			}),
		);

		if (data.ingredients.length > 0) {
			let baseIndex = 0;
			for (const ingredientChunk of chunk(
				data.ingredients,
				D1_MAX_INGREDIENT_ROWS_PER_STATEMENT,
			)) {
				batch.push(
					d1.insert(mealIngredient).values(
						ingredientChunk.map((ing, i) => ({
							mealId,
							cargoId: ing.cargoId,
							ingredientName: ing.ingredientName,
							quantity: ing.quantity,
							unit: ing.unit,
							isOptional: ing.isOptional,
							orderIndex: baseIndex + i,
						})),
					),
				);
				baseIndex += ingredientChunk.length;
			}
		}

		if (data.tags.length > 0) {
			for (const tagChunk of chunk(data.tags, D1_MAX_TAG_ROWS_PER_STATEMENT)) {
				batch.push(
					d1.insert(mealTag).values(
						tagChunk.map((tag) => ({
							mealId,
							tag,
						})),
					),
				);
			}
		}
	}

	// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types are complex
	await d1.batch(batch as [any, ...any[]]);

	const results = await Promise.all(
		mealIds.map((id) => getMeal(db, organizationId, id)),
	);
	return results.filter((m): m is NonNullable<typeof m> => m !== null);
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
				domain: data.domain,
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
		let baseIndex = 0;
		for (const ingredientChunk of chunk(
			data.ingredients,
			D1_MAX_INGREDIENT_ROWS_PER_STATEMENT,
		)) {
			batch.push(
				d1.insert(mealIngredient).values(
					ingredientChunk.map((ing, i) => ({
						mealId,
						cargoId: ing.cargoId,
						ingredientName: ing.ingredientName,
						quantity: ing.quantity,
						unit: ing.unit,
						isOptional: ing.isOptional,
						orderIndex: baseIndex + i,
					})),
				),
			);
			baseIndex += ingredientChunk.length;
		}
	}

	if (data.tags.length > 0) {
		for (const tagChunk of chunk(data.tags, D1_MAX_TAG_ROWS_PER_STATEMENT)) {
			batch.push(
				d1.insert(mealTag).values(
					tagChunk.map((tag) => ({
						mealId,
						tag,
					})),
				),
			);
		}
	}

	// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types are complex
	await d1.batch(batch as [any, ...any[]]);

	return await getMeal(db, organizationId, mealId);
}

/**
 * Creates a provision (single-item "meal" with type='provision').
 * Auto-creates exactly one meal_ingredient row. Counts toward meal capacity.
 */
export async function createProvision(
	db: D1Database,
	organizationId: string,
	data: ProvisionInput,
	env?: Env,
) {
	if (env) {
		const capacity = await checkCapacity(env, organizationId, "meals", 1);
		if (!capacity.allowed) {
			throw new Error(
				`capacity_exceeded:meals:${capacity.current}:${capacity.limit}`,
			);
		}
	}

	const d1 = drizzle(db);
	const mealId = crypto.randomUUID();
	const ingredientId = crypto.randomUUID();

	// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types complex
	const batch: any[] = [
		d1.insert(meal).values({
			id: mealId,
			organizationId,
			name: data.name,
			domain: data.domain,
			type: "provision",
			servings: 1,
		}),
		d1.insert(mealIngredient).values({
			id: ingredientId,
			mealId,
			ingredientName: data.name,
			quantity: data.quantity,
			unit: data.unit,
			orderIndex: 0,
		}),
	];

	if (data.tags.length > 0) {
		for (const tagChunk of chunk(data.tags, D1_MAX_TAG_ROWS_PER_STATEMENT)) {
			batch.push(
				d1.insert(mealTag).values(
					tagChunk.map((tag) => ({
						mealId,
						tag,
					})),
				),
			);
		}
	}

	// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types are complex
	await d1.batch(batch as [any, ...any[]]);

	return await getMeal(db, organizationId, mealId);
}

/**
 * Updates a provision. Only meals with type='provision' can be updated this way.
 * Updates meal name/domain and the single ingredient's name/quantity/unit; replaces tags.
 */
export async function updateProvision(
	db: D1Database,
	organizationId: string,
	mealId: string,
	data: ProvisionUpdateInput,
) {
	const d1 = drizzle(db);

	const [existing] = await d1
		.select()
		.from(meal)
		.where(and(eq(meal.id, mealId), eq(meal.organizationId, organizationId)));

	if (!existing) throw new Error("Provision not found or unauthorized");
	if (existing.type !== "provision") {
		throw new Error("Meal is not a provision; use updateMeal instead");
	}

	const [singleIngredient] = await d1
		.select()
		.from(mealIngredient)
		.where(eq(mealIngredient.mealId, mealId))
		.orderBy(mealIngredient.orderIndex)
		.limit(1);

	if (!singleIngredient) {
		throw new Error("Provision has no ingredient row");
	}

	const mealUpdates: Partial<typeof meal.$inferInsert> = {
		updatedAt: new Date(),
	};
	if (data.name !== undefined) mealUpdates.name = data.name;
	if (data.domain !== undefined) mealUpdates.domain = data.domain;

	const ingUpdates: Partial<typeof mealIngredient.$inferInsert> = {};
	if (data.name !== undefined) ingUpdates.ingredientName = data.name;
	if (data.quantity !== undefined) ingUpdates.quantity = data.quantity;
	if (data.unit !== undefined) ingUpdates.unit = data.unit;

	// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types complex
	const batch: any[] = [
		d1.update(meal).set(mealUpdates).where(eq(meal.id, mealId)),
		d1
			.update(mealIngredient)
			.set(ingUpdates)
			.where(eq(mealIngredient.id, singleIngredient.id)),
	];

	if (data.tags !== undefined) {
		batch.push(d1.delete(mealTag).where(eq(mealTag.mealId, mealId)));
		if (data.tags.length > 0) {
			for (const tagChunk of chunk(data.tags, D1_MAX_TAG_ROWS_PER_STATEMENT)) {
				batch.push(
					d1.insert(mealTag).values(tagChunk.map((tag) => ({ mealId, tag }))),
				);
			}
		}
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
 * Finds cargo rows to deduct from when ingredient has no cargoId.
 * Uses exact match first, then vector similarity fallback.
 * Returns allocations in cargo's native unit for SQL update.
 */
async function findCargoForDeduction(
	env: Env,
	organizationId: string,
	orgCargo: (typeof cargo.$inferSelect)[],
	ingredientName: string,
	requiredQtyInTargetUnit: number,
	targetUnit: SupportedUnit,
): Promise<{ cargoId: string; quantityToDeduct: number }[]> {
	const normalizedName = normalizeForMatch(ingredientName);
	type Candidate = {
		cargo: typeof cargo.$inferSelect;
		qtyInTargetUnit: number;
		isExact: boolean;
		score: number;
	};
	const candidates: Candidate[] = [];

	for (const item of orgCargo) {
		const itemUnit = toSupportedUnit(item.unit) as SupportedUnit;
		const multiplier = getUnitMultiplier(itemUnit, targetUnit);
		if (multiplier === null) continue;

		const qtyInTargetUnit = item.quantity * multiplier;
		const normalizedItem = normalizeForMatch(item.name);
		const isExact = normalizedItem === normalizedName;

		if (isExact) {
			candidates.push({
				cargo: item,
				qtyInTargetUnit,
				isExact: true,
				score: 1,
			});
		}
	}

	if (candidates.length === 0) {
		const similar = await findSimilarCargo(
			env,
			organizationId,
			ingredientName,
			{
				topK: 3,
				threshold: SIMILARITY_THRESHOLDS.CARGO_DEDUCTION,
			},
		);
		for (const match of similar) {
			const item = orgCargo.find((c) => c.id === match.itemId);
			if (!item) continue;
			const itemUnit = toSupportedUnit(item.unit) as SupportedUnit;
			const multiplier = getUnitMultiplier(itemUnit, targetUnit);
			if (multiplier === null) continue;
			candidates.push({
				cargo: item,
				qtyInTargetUnit: item.quantity * multiplier,
				isExact: false,
				score: match.score,
			});
		}
	}

	// Sort: exact first, then by score desc, then by quantity desc
	candidates.sort((a, b) => {
		if (a.isExact !== b.isExact) return a.isExact ? -1 : 1;
		if (a.score !== b.score) return b.score - a.score;
		return b.qtyInTargetUnit - a.qtyInTargetUnit;
	});

	let remaining = requiredQtyInTargetUnit;
	const allocations: { cargoId: string; quantityToDeduct: number }[] = [];

	for (const { cargo: item } of candidates) {
		if (remaining <= 0) break;

		const itemUnit = toSupportedUnit(item.unit) as SupportedUnit;
		const multiplier = getUnitMultiplier(itemUnit, targetUnit);
		if (multiplier === null) continue;

		const availableInTarget = item.quantity * multiplier;
		const toDeductInTarget = Math.min(remaining, availableInTarget);
		remaining -= toDeductInTarget;

		const toDeductInCargoUnit = toDeductInTarget / multiplier;
		allocations.push({
			cargoId: item.id,
			quantityToDeduct: toDeductInCargoUnit,
		});
	}

	return remaining <= 0 ? allocations : [];
}

/**
 * Executes a meal cooking procedure.
 *
 * Safety Features:
 * 1. Ownership Verification: Ensures the meal belongs to the organization.
 * 2. Inventory Check: Verifies all linked inventory items have sufficient quantity.
 * 3. Name-based fallback: When cargoId is null, matches cargo by name (same logic as supply).
 * 4. Race Condition Prevention: Uses a batch operation for deduction.
 * 5. Input Validation: Prevents SQL injection via type-safe Drizzle parameters.
 *
 * Servings resolution order:
 *   options.servings → activeMealSelection.servingsOverride → meal.servings
 */
export async function cookMeal(
	env: Env,
	organizationId: string,
	mealId: string,
	options?: { servings?: number },
) {
	const d1 = drizzle(env.DB);

	// 1+2+3 in a single D1 batch round-trip: meal record, ingredients, and
	// active-selection override are all fetched simultaneously.
	const [mealResults, ingredients, selectionResults] = await d1.batch([
		d1
			.select()
			.from(meal)
			.where(and(eq(meal.id, mealId), eq(meal.organizationId, organizationId))),
		d1
			.select()
			.from(mealIngredient)
			.where(eq(mealIngredient.mealId, mealId))
			.orderBy(mealIngredient.orderIndex),
		d1
			.select({ servingsOverride: activeMealSelection.servingsOverride })
			.from(activeMealSelection)
			.where(
				and(
					eq(activeMealSelection.organizationId, organizationId),
					eq(activeMealSelection.mealId, mealId),
				),
			),
	]);

	const mealRecord = mealResults[0];
	if (!mealRecord) {
		throw new Error("Meal not found or unauthorized for this organization.");
	}

	// Resolve effective servings: explicit option → selection override → base
	let effectiveServings = mealRecord.servings ?? 1;
	if (options?.servings != null) {
		effectiveServings = options.servings;
	} else {
		const selection = selectionResults[0];
		if (selection?.servingsOverride != null) {
			effectiveServings = selection.servingsOverride;
		}
	}

	const scaleFactor = getScaleFactor(
		mealRecord.servings ?? 1,
		effectiveServings,
	);

	const linkedIngredients = ingredients.filter(
		(ing) => ing.cargoId && typeof ing.cargoId === "string",
	);
	const unlinkedIngredients = ingredients.filter(
		(ing) => !ing.cargoId || typeof ing.cargoId !== "string",
	);

	// 4. Build deduction updates: linked (by cargoId) and unlinked (by name match)
	// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types are complex
	const updates: any[] = [];
	let cargoById = new Map<string, typeof cargo.$inferSelect>();

	if (linkedIngredients.length > 0) {
		const cargoIds = linkedIngredients.map((ing) => ing.cargoId as string);
		const currentCargo = await chunkedQuery(
			cargoIds,
			(chunk) =>
				d1
					.select()
					.from(cargo)
					.where(
						and(
							eq(cargo.organizationId, organizationId),
							inArray(cargo.id, chunk),
						),
					),
			D1_MAX_BOUND_PARAMS - 1,
		);

		cargoById = new Map(currentCargo.map((i) => [i.id, i]));

		const insufficient = linkedIngredients.filter((ing) => {
			if (ing.isOptional) return false;
			const c = cargoById.get(ing.cargoId as string);
			if (!c) return true;
			const ingUnit = toSupportedUnit(ing.unit);
			const cargoUnit = toSupportedUnit(c.unit);
			const scaledQty = scaleQuantity(ing.quantity, scaleFactor, ing.unit);
			const deductionInCargoUnit = convertQuantity(
				scaledQty,
				ingUnit,
				cargoUnit,
			);
			if (deductionInCargoUnit === null) return true;
			return c.quantity < deductionInCargoUnit;
		});

		if (insufficient.length > 0) {
			const names = insufficient.map((i) => i.ingredientName).join(", ");
			throw new Error(`Insufficient Cargo for: ${names}`);
		}

		for (const ing of linkedIngredients) {
			const c = cargoById.get(ing.cargoId as string);
			if (!c) {
				if (ing.isOptional) continue;
				throw new Error(`Cargo not found for ingredient ${ing.ingredientName}`);
			}
			const ingUnit = toSupportedUnit(ing.unit);
			const cargoUnit = toSupportedUnit(c.unit);
			const scaledQty = scaleQuantity(ing.quantity, scaleFactor, ing.unit);
			const deductionInCargoUnit = convertQuantity(
				scaledQty,
				ingUnit,
				cargoUnit,
			);
			if (deductionInCargoUnit === null) {
				if (ing.isOptional) continue;
				throw new Error(
					`Cannot convert ${ing.unit} to ${c.unit} for ${ing.ingredientName}`,
				);
			}
			if (c.quantity < deductionInCargoUnit) {
				if (ing.isOptional) continue;
				throw new Error(`Insufficient Cargo for: ${ing.ingredientName}`);
			}
			updates.push(
				d1
					.update(cargo)
					.set({
						quantity: sql`${cargo.quantity} - ${deductionInCargoUnit}`,
					})
					.where(
						and(
							eq(cargo.id, ing.cargoId as string),
							eq(cargo.organizationId, organizationId),
						),
					),
			);
		}
	}

	// 5. Name-based deduction for unlinked ingredients
	if (unlinkedIngredients.length > 0) {
		let orgCargo = await d1
			.select()
			.from(cargo)
			.where(eq(cargo.organizationId, organizationId));

		// Adjust effective quantities for linked deductions (same cargo row may be used by both)
		if (linkedIngredients.length > 0 && cargoById) {
			const linkedDeductions = new Map<string, number>();
			for (const ing of linkedIngredients) {
				const c = cargoById.get(ing.cargoId as string);
				if (!c) continue;
				const ingUnit = toSupportedUnit(ing.unit);
				const cargoUnit = toSupportedUnit(c.unit);
				const scaledQty = scaleQuantity(ing.quantity, scaleFactor, ing.unit);
				const deduction = convertQuantity(scaledQty, ingUnit, cargoUnit);
				if (deduction === null) continue;
				if (c.quantity < deduction && ing.isOptional) continue;
				linkedDeductions.set(
					c.id,
					(linkedDeductions.get(c.id) ?? 0) + deduction,
				);
			}
			orgCargo = orgCargo.map((item) => ({
				...item,
				quantity: item.quantity - (linkedDeductions.get(item.id) ?? 0),
			}));
		}

		const insufficient: string[] = [];

		for (const ing of unlinkedIngredients) {
			const targetUnit = toSupportedUnit(ing.unit) as SupportedUnit;
			const scaledQty = scaleQuantity(ing.quantity, scaleFactor, ing.unit);
			if (scaledQty <= 0) continue;

			const allocations = await findCargoForDeduction(
				env,
				organizationId,
				orgCargo,
				ing.ingredientName,
				scaledQty,
				targetUnit,
			);

			if (allocations.length === 0) {
				if (!ing.isOptional) insufficient.push(ing.ingredientName);
				continue;
			}

			for (const { cargoId, quantityToDeduct } of allocations) {
				updates.push(
					d1
						.update(cargo)
						.set({
							quantity: sql`${cargo.quantity} - ${quantityToDeduct}`,
						})
						.where(
							and(
								eq(cargo.id, cargoId),
								eq(cargo.organizationId, organizationId),
							),
						),
				);
			}
		}

		if (insufficient.length > 0) {
			throw new Error(`Insufficient Cargo for: ${insufficient.join(", ")}`);
		}
	}

	if (updates.length > 0) {
		trackD1BatchSize("cookMeal", updates.length, {
			organizationRef: organizationId,
		});
		await trackWriteOperation(
			"cookMeal",
			// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types are complex
			() => d1.batch(updates as [any, ...any[]]),
			{
				organizationRef: organizationId,
			},
		);
	}

	return {
		cooked: true,
		ingredientsDeducted: updates.length,
		servings: effectiveServings,
	};
}

/**
 * Creates a provision from an existing cargo item, linking via cargoId.
 * Prevents duplicates: if a provision already has an ingredient pointing to
 * this cargo item, returns the existing provision with alreadyExisted=true.
 */
export async function createProvisionFromCargo(
	db: D1Database,
	organizationId: string,
	cargoId: string,
	env?: Env,
): Promise<{
	provision: Awaited<ReturnType<typeof getMeal>>;
	alreadyExisted: boolean;
}> {
	const d1 = drizzle(db);

	// Load cargo with RLS
	const [cargoItem] = await d1
		.select()
		.from(cargo)
		.where(
			and(eq(cargo.id, cargoId), eq(cargo.organizationId, organizationId)),
		);

	if (!cargoItem) {
		throw new Error("Cargo item not found or unauthorized");
	}

	// Duplicate check: find an existing provision whose ingredient links to this cargo
	const existingByCargoId = await d1
		.select({ mealId: mealIngredient.mealId })
		.from(mealIngredient)
		.innerJoin(meal, eq(mealIngredient.mealId, meal.id))
		.where(
			and(
				eq(mealIngredient.cargoId, cargoId),
				eq(meal.organizationId, organizationId),
				eq(meal.type, "provision"),
			),
		)
		.limit(1);

	if (existingByCargoId.length > 0) {
		const existing = await getMeal(
			db,
			organizationId,
			existingByCargoId[0].mealId,
		);
		return { provision: existing, alreadyExisted: true };
	}

	// Capacity check
	if (env) {
		const capacity = await checkCapacity(env, organizationId, "meals", 1);
		if (!capacity.allowed) {
			throw new Error(
				`capacity_exceeded:meals:${capacity.current}:${capacity.limit}`,
			);
		}
	}

	const mealId = crypto.randomUUID();
	const ingredientId = crypto.randomUUID();
	const tags = Array.isArray(cargoItem.tags)
		? (cargoItem.tags as string[])
		: [];

	// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types complex
	const batch: any[] = [
		d1.insert(meal).values({
			id: mealId,
			organizationId,
			name: cargoItem.name,
			domain: cargoItem.domain,
			type: "provision",
			servings: 1,
		}),
		d1.insert(mealIngredient).values({
			id: ingredientId,
			mealId,
			cargoId,
			ingredientName: cargoItem.name,
			quantity: cargoItem.quantity,
			unit: cargoItem.unit,
			orderIndex: 0,
		}),
	];

	if (tags.length > 0) {
		for (const tagChunk of chunk(tags, D1_MAX_TAG_ROWS_PER_STATEMENT)) {
			batch.push(
				d1.insert(mealTag).values(
					tagChunk.map((tag) => ({
						mealId,
						tag,
					})),
				),
			);
		}
	}

	// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types are complex
	await d1.batch(batch as [any, ...any[]]);

	const provision = await getMeal(db, organizationId, mealId);
	return { provision, alreadyExisted: false };
}

/**
 * Returns cargo IDs that already have a linked provision in this org.
 * Used to show "In Galley" indicator on cargo cards.
 */
export async function getPromotedCargoIds(
	db: D1Database,
	organizationId: string,
): Promise<string[]> {
	const d1 = drizzle(db);

	const rows = await d1
		.select({ cargoId: mealIngredient.cargoId })
		.from(mealIngredient)
		.innerJoin(meal, eq(mealIngredient.mealId, meal.id))
		.where(
			and(eq(meal.organizationId, organizationId), eq(meal.type, "provision")),
		);

	return rows.map((r) => r.cargoId).filter((id): id is string => id !== null);
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
