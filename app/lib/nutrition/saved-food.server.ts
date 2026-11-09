import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "~/db/schema";
import type { SaveFoodInput } from "~/lib/schemas/saved-food";
import type { SavedFoodNumbers } from "./saved-food";

export class SavedFoodNotFoundError extends Error {
	readonly code = "not_found" as const;
	readonly status = 404;

	constructor() {
		super("Saved food not found");
		this.name = "SavedFoodNotFoundError";
	}
}

type Db = ReturnType<typeof drizzle<typeof schema>>;

function database(db: D1Database): Db {
	return drizzle(db, { schema });
}

function toNumbers(
	row: typeof schema.nutritionSavedFood.$inferSelect,
): SavedFoodNumbers {
	return {
		id: row.id,
		userId: row.userId,
		name: row.name,
		energyKcal: row.energyKcal,
		proteinG: row.proteinG,
		carbsG: row.carbsG,
		fatG: row.fatG,
		fiberG: row.fiberG ?? null,
		defaultAmount: row.defaultAmount ?? null,
		defaultUnit: row.defaultUnit ?? null,
		barcode: row.barcode ?? null,
		fdcId: row.fdcId ?? null,
	};
}

export async function listSavedFoods(
	db: D1Database,
	userId: string,
): Promise<SavedFoodNumbers[]> {
	const rows = await database(db)
		.select()
		.from(schema.nutritionSavedFood)
		.where(eq(schema.nutritionSavedFood.userId, userId))
		.orderBy(
			desc(schema.nutritionSavedFood.updatedAt),
			desc(schema.nutritionSavedFood.id),
		);
	return rows.map(toNumbers);
}

export async function loadOwnedSavedFood(
	db: D1Database,
	userId: string,
	savedFoodId: string,
): Promise<SavedFoodNumbers | null> {
	const [row] = await database(db)
		.select()
		.from(schema.nutritionSavedFood)
		.where(
			and(
				eq(schema.nutritionSavedFood.id, savedFoodId),
				eq(schema.nutritionSavedFood.userId, userId),
			),
		)
		.limit(1);
	return row ? toNumbers(row) : null;
}

/**
 * Star or custom macros. The same name for this person updates the saved
 * numbers and does not rewrite intake rows that already copied them.
 */
export async function saveFood(
	db: D1Database,
	userId: string,
	input: SaveFoodInput,
	now = new Date(),
): Promise<SavedFoodNumbers> {
	const store = database(db);
	const name = input.name.trim();
	const [existing] = await store
		.select()
		.from(schema.nutritionSavedFood)
		.where(
			and(
				eq(schema.nutritionSavedFood.userId, userId),
				eq(schema.nutritionSavedFood.name, name),
			),
		)
		.limit(1);
	const values = {
		name,
		energyKcal: input.macros.energyKcal,
		proteinG: input.macros.proteinG,
		carbsG: input.macros.carbsG,
		fatG: input.macros.fatG,
		fiberG: input.macros.fiberG ?? null,
		defaultAmount: input.amount,
		defaultUnit: input.unit,
		barcode: input.barcode ?? null,
		fdcId: input.fdcId ?? null,
		updatedAt: now,
	};
	if (existing) {
		await store
			.update(schema.nutritionSavedFood)
			.set(values)
			.where(
				and(
					eq(schema.nutritionSavedFood.id, existing.id),
					eq(schema.nutritionSavedFood.userId, userId),
				),
			);
		const updated = await loadOwnedSavedFood(db, userId, existing.id);
		if (!updated) throw new SavedFoodNotFoundError();
		return updated;
	}
	const id = crypto.randomUUID();
	await store.insert(schema.nutritionSavedFood).values({
		id,
		userId,
		...values,
		createdAt: now,
	});
	const created = await loadOwnedSavedFood(db, userId, id);
	if (!created) throw new SavedFoodNotFoundError();
	return created;
}

/**
 * Deletes the saved food only. Past intake stays, and the database sets
 * saved_food_id null. Does not set voided_at.
 */
export async function deleteSavedFood(
	db: D1Database,
	userId: string,
	savedFoodId: string,
): Promise<{ deleted: true }> {
	const owned = await loadOwnedSavedFood(db, userId, savedFoodId);
	if (!owned) throw new SavedFoodNotFoundError();
	await database(db)
		.delete(schema.nutritionSavedFood)
		.where(
			and(
				eq(schema.nutritionSavedFood.id, savedFoodId),
				eq(schema.nutritionSavedFood.userId, userId),
			),
		);
	return { deleted: true };
}
