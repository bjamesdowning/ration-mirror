/**
 * Salvage a usable skeleton recipe from malformed or error-shaped Gemini JSON.
 */

import {
	type RecipeImportAISuccess,
	RecipeImportAISuccessSchema,
} from "~/lib/schemas/recipe-import";

function salvageIngredients(raw: unknown): Array<{
	name: string;
	quantity: number;
	unit: string;
	isOptional?: boolean;
}> {
	if (!Array.isArray(raw)) return [];
	const out: Array<{
		name: string;
		quantity: number;
		unit: string;
		isOptional?: boolean;
	}> = [];
	for (const item of raw) {
		if (typeof item === "string") {
			const name = item.trim().toLowerCase();
			if (name.length > 0) {
				out.push({ name, quantity: 0, unit: "unit" });
			}
			continue;
		}
		if (!item || typeof item !== "object") continue;
		const rec = item as Record<string, unknown>;
		const name =
			typeof rec.name === "string"
				? rec.name.trim().toLowerCase()
				: typeof rec.ingredientName === "string"
					? rec.ingredientName.trim().toLowerCase()
					: "";
		if (!name) continue;
		const quantity =
			typeof rec.quantity === "number" && rec.quantity >= 0 ? rec.quantity : 0;
		const unit =
			typeof rec.unit === "string" && rec.unit.trim().length > 0
				? rec.unit.trim().toLowerCase()
				: "unit";
		out.push({
			name,
			quantity,
			unit,
			isOptional: rec.isOptional === true,
		});
	}
	return out;
}

function salvageSteps(raw: unknown): string[] {
	if (!Array.isArray(raw)) return [];
	return raw
		.map((item) => {
			if (typeof item === "string") return item.trim();
			if (item && typeof item === "object" && "text" in item) {
				const text = (item as { text?: unknown }).text;
				return typeof text === "string" ? text.trim() : "";
			}
			return "";
		})
		.filter((s) => s.length > 0);
}

/**
 * Best-effort skeleton from a parsed model object that failed Zod.
 * Returns null when neither ingredients nor steps can be recovered.
 */
export function salvageRecipeImportPayload(
	raw: unknown,
): RecipeImportAISuccess | null {
	if (!raw || typeof raw !== "object") return null;
	const obj = raw as Record<string, unknown>;
	const ingredients = salvageIngredients(obj.ingredients);
	const steps = salvageSteps(obj.steps);
	if (ingredients.length === 0 && steps.length === 0) return null;

	const title =
		typeof obj.title === "string" && obj.title.trim().length > 0
			? obj.title.trim()
			: "Imported recipe";
	const parsed = RecipeImportAISuccessSchema.safeParse({
		status: "ok",
		title,
		description: typeof obj.description === "string" ? obj.description : "",
		completeness: "skeleton",
		ingredients,
		steps,
		prepTime: typeof obj.prepTime === "number" ? obj.prepTime : 0,
		cookTime: typeof obj.cookTime === "number" ? obj.cookTime : 0,
		servings: typeof obj.servings === "number" ? obj.servings : 1,
		tags: Array.isArray(obj.tags)
			? obj.tags.filter((t): t is string => typeof t === "string")
			: [],
		equipment: Array.isArray(obj.equipment)
			? obj.equipment.filter((t): t is string => typeof t === "string")
			: [],
	});
	return parsed.success ? parsed.data : null;
}
