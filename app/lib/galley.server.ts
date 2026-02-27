import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { meal } from "../db/schema";
import { checkCapacity } from "./capacity.server";
import {
	createMeal,
	createProvision,
	getMeals,
	updateMeal,
	updateProvision,
} from "./meals.server";
import { chunkArray } from "./query-utils.server";
import type {
	GalleyManifest,
	ManifestProvision,
	ManifestRecipe,
} from "./schemas/galley-manifest";
import { normalizeUnitAlias } from "./units";

const MAX_MEALS_IMPORT = 100;

type MealWithIngredients = Awaited<ReturnType<typeof getMeals>>[number];

/**
 * Fetches all meals for an organization and transforms them into the manifest format.
 */
export async function getGalleyForExport(
	db: D1Database,
	organizationId: string,
) {
	const meals = await getMeals(db, organizationId);
	return mealsToManifest(meals);
}

function mealsToManifest(meals: MealWithIngredients[]): GalleyManifest {
	const manifestMeals = meals.map((m) => {
		if (m.type === "provision") {
			const ing = m.ingredients[0];
			return {
				id: m.id,
				name: m.name,
				type: "provision" as const,
				domain: m.domain as "food" | "household" | "alcohol",
				quantity: ing ? ing.quantity : 1,
				unit: normalizeUnitAlias(ing ? ing.unit : "unit"),
				tags: m.tags,
			};
		}
		return {
			id: m.id,
			name: m.name,
			type: "recipe" as const,
			domain: m.domain as "food" | "household" | "alcohol",
			description: m.description ?? undefined,
			directions: m.directions ?? undefined,
			equipment: Array.isArray(m.equipment) ? m.equipment : [],
			servings: m.servings ?? 1,
			prepTime: m.prepTime ?? undefined,
			cookTime: m.cookTime ?? undefined,
			ingredients: m.ingredients.map((ing, i) => ({
				ingredientName: ing.ingredientName,
				quantity: ing.quantity,
				unit: normalizeUnitAlias(ing.unit),
				isOptional: ing.isOptional ?? false,
				orderIndex: i,
			})),
			tags: m.tags,
		};
	});

	return {
		version: 1,
		exportedAt: new Date().toISOString(),
		meals: manifestMeals,
	};
}

export interface ApplyGalleyImportResult {
	imported: number;
	updated: number;
	errors: Array<{ name: string; error: string }>;
}

/**
 * Applies a galley manifest import. Creates or updates meals by id.
 * Provisions: single-ingredient meals. Recipes: multi-ingredient meals.
 */
export async function applyGalleyImport(
	db: D1Database,
	organizationId: string,
	manifest: GalleyManifest,
	env?: Env,
): Promise<ApplyGalleyImportResult> {
	const result: ApplyGalleyImportResult = {
		imported: 0,
		updated: 0,
		errors: [],
	};

	const meals = manifest.meals.slice(0, MAX_MEALS_IMPORT);
	if (meals.length === 0) {
		return result;
	}

	const d1 = drizzle(db);

	// Check capacity for new meals (those without existing id)
	const idsToCheck = [
		...new Set(meals.map((m) => m.id).filter((id): id is string => !!id)),
	];
	const existingIds = new Set<string>();
	if (idsToCheck.length > 0) {
		// D1 limits 100 bound params; inArray uses 1 per id + orgId = idsToCheck.length + 1
		const chunks = chunkArray(idsToCheck, 99);
		for (const chunk of chunks) {
			const rows = await d1
				.select({ id: meal.id })
				.from(meal)
				.where(
					and(eq(meal.organizationId, organizationId), inArray(meal.id, chunk)),
				);
			for (const r of rows) existingIds.add(r.id);
		}
	}

	const toCreate = meals.filter((m) => !m.id || !existingIds.has(m.id));
	if (toCreate.length > 0 && env) {
		const capacity = await checkCapacity(
			env,
			organizationId,
			"meals",
			toCreate.length,
		);
		if (!capacity.allowed) {
			for (const m of toCreate) {
				result.errors.push({
					name: m.name,
					error: "capacity_exceeded",
				});
			}
			return result;
		}
	}

	for (const m of meals) {
		try {
			if (m.type === "provision") {
				const prov = m as ManifestProvision;
				if (prov.id && existingIds.has(prov.id)) {
					await updateProvision(db, organizationId, prov.id, {
						name: prov.name,
						domain: prov.domain,
						quantity: prov.quantity,
						unit: prov.unit,
						tags: prov.tags,
					});
					result.updated += 1;
				} else {
					await createProvision(
						db,
						organizationId,
						{
							name: prov.name,
							domain: prov.domain,
							quantity: prov.quantity,
							unit: prov.unit,
							tags: prov.tags,
						},
						env,
					);
					result.imported += 1;
				}
			} else {
				const rec = m as ManifestRecipe;
				const mealInput = {
					name: rec.name,
					domain: rec.domain,
					description: rec.description,
					directions: rec.directions ?? undefined,
					equipment: rec.equipment,
					servings: rec.servings,
					prepTime: rec.prepTime,
					cookTime: rec.cookTime,
					customFields: {},
					ingredients: rec.ingredients.map((ing, i) => ({
						ingredientName: ing.ingredientName,
						quantity: ing.quantity,
						unit: ing.unit,
						isOptional: ing.isOptional,
						orderIndex: i,
						cargoId: null,
					})),
					tags: rec.tags,
				};

				if (rec.id && existingIds.has(rec.id)) {
					await updateMeal(db, organizationId, rec.id, mealInput);
					result.updated += 1;
				} else {
					await createMeal(db, organizationId, mealInput, env);
					result.imported += 1;
				}
			}
		} catch (e) {
			result.errors.push({
				name: m.name,
				error: e instanceof Error ? e.message : String(e),
			});
		}
	}

	return result;
}
