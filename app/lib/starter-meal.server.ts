/**
 * Lean starter Galley meal for new human personal orgs.
 * Dual-path with welcome credits: auth signup hook + mobile ensureOrganizationForUser.
 * Agents never receive this meal (isAgentStubEmail / provisionAgentUser bypass).
 */

import { and, eq, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "~/db/schema";
import { isAgentStubEmail } from "~/lib/agent/stub-user";
import { computeBaseFields } from "~/lib/base-quantity";
import { type RecipeStep, serializeDirections } from "~/lib/schemas/directions";

export const STARTER_MEAL_SEED_KEY = "starter:hot-chocolate";
export const STARTER_MEAL_NAME = "hot chocolate";

const STARTER_DIRECTIONS: RecipeStep[] = [
	{
		position: 1,
		text: "Add the milk to a small saucepan over medium-low heat.",
	},
	{
		position: 2,
		text: "Whisk in the cocoa powder and sugar until no dry lumps remain.",
	},
	{
		position: 3,
		text: "Heat gently, whisking often, until steaming hot — do not boil.",
	},
	{
		position: 4,
		text: "Pour into a mug and serve.",
	},
];

const STARTER_INGREDIENTS: Array<{
	ingredientName: string;
	quantity: number;
	unit: string;
}> = [
	{ ingredientName: "milk", quantity: 250, unit: "ml" },
	{ ingredientName: "cocoa powder", quantity: 2, unit: "tbsp" },
	{ ingredientName: "sugar", quantity: 1, unit: "tbsp" },
];

type AppDb = DrizzleD1Database<typeof schema>;

/** Meal + ingredient INSERT statements for inclusion in an org-creation batch. */
export function buildStarterMealStatements(
	db: AppDb,
	organizationId: string,
	mealId: string = crypto.randomUUID(),
) {
	const directions = serializeDirections(STARTER_DIRECTIONS);
	const mealInsert = db.insert(schema.meal).values({
		id: mealId,
		organizationId,
		name: STARTER_MEAL_NAME,
		domain: "food",
		type: "recipe",
		description:
			"A simple stovetop cocoa — warm milk whisked with cocoa and sugar.",
		directions,
		equipment: ["saucepan", "whisk"],
		servings: 1,
		prepTime: 2,
		cookTime: 5,
		customFields: { seedKey: STARTER_MEAL_SEED_KEY },
	});

	const ingredientInsert = db.insert(schema.mealIngredient).values(
		STARTER_INGREDIENTS.map((ing, orderIndex) => {
			const base = computeBaseFields(
				ing.quantity,
				ing.unit,
				ing.ingredientName,
			);
			return {
				id: crypto.randomUUID(),
				mealId,
				cargoId: null,
				ingredientName: ing.ingredientName,
				quantity: ing.quantity,
				unit: ing.unit,
				baseQuantity: base.baseQuantity,
				baseUnit: base.baseUnit,
				isOptional: false,
				orderIndex,
			};
		}),
	);

	return { mealId, mealInsert, ingredientInsert };
}

export function shouldSeedStarterMeal(
	email: string | null | undefined,
): boolean {
	if (!email) return true;
	return !isAgentStubEmail(email);
}

/** O(1) existence check — org filter + seedKey via json_extract, LIMIT 1. */
async function hasStarterMeal(
	db: AppDb,
	organizationId: string,
): Promise<boolean> {
	const rows = await db
		.select({ id: schema.meal.id })
		.from(schema.meal)
		.where(
			and(
				eq(schema.meal.organizationId, organizationId),
				sql`json_extract(${schema.meal.customFields}, '$.seedKey') = ${STARTER_MEAL_SEED_KEY}`,
			),
		)
		.limit(1);
	return rows.length > 0;
}

/**
 * Idempotent backfill when org already exists (mobile ensure after hook race/failure).
 * Returns true when a meal was inserted.
 */
export async function seedStarterMealIfNeeded(
	db: AppDb,
	organizationId: string,
	email?: string | null,
): Promise<boolean> {
	if (!shouldSeedStarterMeal(email)) return false;
	if (await hasStarterMeal(db, organizationId)) return false;

	const { mealInsert, ingredientInsert } = buildStarterMealStatements(
		db,
		organizationId,
	);
	await db.batch([
		mealInsert,
		ingredientInsert,
		// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types are complex
	] as [any, ...any[]]);
	return true;
}

/** Exposes recipe shape for unit tests without writing. */
export function getStarterMealRecipeShape() {
	return {
		seedKey: STARTER_MEAL_SEED_KEY,
		name: STARTER_MEAL_NAME,
		ingredients: STARTER_INGREDIENTS.map((i) => ({ ...i, cargoId: null })),
		directions: STARTER_DIRECTIONS,
		equipment: ["saucepan", "whisk"] as const,
		servings: 1,
		prepTime: 2,
		cookTime: 5,
		description:
			"A simple stovetop cocoa — warm milk whisked with cocoa and sugar.",
	};
}
