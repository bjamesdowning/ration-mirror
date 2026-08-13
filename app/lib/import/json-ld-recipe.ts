/**
 * Extract schema.org Recipe JSON-LD from HTML, including @graph and @type arrays.
 */

function typeIncludesRecipe(type: unknown): boolean {
	if (type === "Recipe") return true;
	return Array.isArray(type) && type.includes("Recipe");
}

function typeIncludes(type: unknown, wanted: string): boolean {
	if (type === wanted) return true;
	return Array.isArray(type) && type.includes(wanted);
}

function flattenHowToInstructions(value: unknown): string[] {
	if (typeof value === "string") {
		const trimmed = value.trim();
		return trimmed.length > 0 ? [trimmed] : [];
	}
	if (Array.isArray(value)) {
		return value.flatMap((item) => flattenHowToInstructions(item));
	}
	if (!value || typeof value !== "object") return [];
	const rec = value as Record<string, unknown>;
	if (typeIncludes(rec["@type"], "HowToSection")) {
		return flattenHowToInstructions(
			rec.itemListElement ?? rec.steps ?? rec.recipeInstructions,
		);
	}
	if (typeIncludes(rec["@type"], "HowToStep")) {
		const text = rec.text ?? rec.name;
		return typeof text === "string" && text.trim().length > 0
			? [text.trim()]
			: [];
	}
	if (typeof rec.text === "string" && rec.text.trim().length > 0) {
		return [rec.text.trim()];
	}
	return [];
}

function normalizeRecipeNode(
	node: Record<string, unknown>,
): Record<string, unknown> {
	const steps = flattenHowToInstructions(node.recipeInstructions);
	if (steps.length === 0) return node;
	return { ...node, recipeInstructions: steps };
}

function recipeLooksUsable(node: Record<string, unknown>): boolean {
	const name = typeof node.name === "string" && node.name.trim().length > 0;
	const ingredients = node.recipeIngredient;
	const hasIngredients =
		(Array.isArray(ingredients) && ingredients.length > 0) ||
		(typeof ingredients === "string" && ingredients.trim().length > 0);
	const hasSteps = flattenHowToInstructions(node.recipeInstructions).length > 0;
	return Boolean(name && (hasIngredients || hasSteps));
}

function walkForRecipe(
	node: unknown,
	depth = 0,
): Record<string, unknown> | null {
	if (!node || typeof node !== "object" || depth > 8) return null;
	if (Array.isArray(node)) {
		for (const item of node) {
			const found = walkForRecipe(item, depth + 1);
			if (found) return found;
		}
		return null;
	}
	const rec = node as Record<string, unknown>;
	if (typeIncludesRecipe(rec["@type"])) {
		const normalized = normalizeRecipeNode(rec);
		if (recipeLooksUsable(normalized)) return normalized;
	}
	if (rec["@graph"] != null) {
		const fromGraph = walkForRecipe(rec["@graph"], depth + 1);
		if (fromGraph) return fromGraph;
	}
	return null;
}

/** Extract a schema.org Recipe object from HTML JSON-LD script tags. */
export function extractJsonLdRecipe(html: string): string | null {
	const scriptPattern =
		/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
	const blocks = Array.from(html.matchAll(scriptPattern));
	for (const match of blocks) {
		const raw = match[1]?.trim();
		if (!raw) continue;
		try {
			const parsed: unknown = JSON.parse(raw);
			const recipe = walkForRecipe(parsed);
			if (recipe) return JSON.stringify(recipe);
		} catch {
			/* ignore malformed JSON-LD */
		}
	}
	return null;
}
