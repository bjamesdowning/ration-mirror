import {
	normalizeDirections,
	serializeDirections,
} from "~/lib/schemas/directions";

export type MobileGeneratedRecipeInput = {
	name?: string;
	description?: string;
	directions?: unknown;
	ingredients?: Array<{
		name?: string;
		ingredientName?: string;
		quantity?: number;
		unit?: string;
		inventoryName?: string;
		cargoId?: string | null;
	}>;
	prepTime?: number;
	cookTime?: number;
	servings?: number;
	tags?: string[];
};

export type MobileGeneratedRecipe = {
	name: string;
	description: string;
	directions: string;
	servings: number;
	prepTime: number;
	cookTime: number;
	ingredients: Array<{
		ingredientName: string;
		quantity: number;
		unit: string;
		cargoId: string | null;
		isOptional: boolean;
		orderIndex: number;
	}>;
	tags: string[];
};

/** Normalizes AI job poll recipes into mobile meal-create shape. */
export function normalizeMobileGeneratedRecipes(
	recipes: MobileGeneratedRecipeInput[] | undefined,
): MobileGeneratedRecipe[] {
	if (!recipes?.length) return [];

	return recipes.map((recipe, recipeIndex) => {
		const ingredients = (recipe.ingredients ?? []).map((ingredient, index) => ({
			ingredientName: (
				ingredient.ingredientName ??
				ingredient.name ??
				""
			).trim(),
			quantity: ingredient.quantity ?? 0,
			unit: ingredient.unit ?? "unit",
			cargoId: ingredient.cargoId ?? null,
			isOptional: false,
			orderIndex: index,
		}));

		const directionsSteps = normalizeDirections(recipe.directions ?? []);

		return {
			name: recipe.name?.trim() || `Generated Recipe ${recipeIndex + 1}`,
			description: recipe.description?.trim() ?? "",
			directions: serializeDirections(directionsSteps),
			servings: recipe.servings ?? 1,
			prepTime: recipe.prepTime ?? 0,
			cookTime: recipe.cookTime ?? 0,
			ingredients,
			tags: recipe.tags?.length ? recipe.tags : ["ai-generated"],
		};
	});
}
