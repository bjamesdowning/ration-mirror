/**
 * Import completeness ladder: full → skeleton → link_holder.
 * Used by extraction prompts, job results, and client verification badges.
 */

export const IMPORT_COMPLETENESS = ["full", "skeleton", "link_holder"] as const;

export type ImportCompleteness = (typeof IMPORT_COMPLETENESS)[number];

export function isImportCompleteness(
	value: unknown,
): value is ImportCompleteness {
	return (
		typeof value === "string" &&
		(IMPORT_COMPLETENESS as readonly string[]).includes(value)
	);
}

/** Classify an AI ok payload into full vs skeleton. */
export function classifyAiSuccessCompleteness(input: {
	ingredients: Array<{ name: string; quantity: number; unit: string }>;
	steps: string[];
}): Exclude<ImportCompleteness, "link_holder"> {
	const namedIngredients = input.ingredients.filter(
		(i) => i.name.trim().length > 0,
	);
	const steps = input.steps.filter((s) => s.trim().length > 0);
	const hasQty = namedIngredients.some(
		(i) => i.quantity > 0 && i.unit.trim().length > 0 && i.unit !== "unit",
	);
	const hasMultipleSteps = steps.length >= 3;
	const hasBothSides = namedIngredients.length >= 2 && steps.length >= 1;

	if (hasBothSides && hasQty && hasMultipleSteps) {
		return "full";
	}
	return "skeleton";
}
