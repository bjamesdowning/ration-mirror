/**
 * Canonical allergen definitions covering the EU Big 14 plus common US additions.
 * Slugs are the source of truth; UI maps them to display labels.
 */

export const ALLERGEN_SLUGS = [
	"milk",
	"eggs",
	"fish",
	"shellfish",
	"tree-nuts",
	"peanuts",
	"wheat",
	"soybeans",
	"sesame",
	"mustard",
	"celery",
	"lupin",
	"molluscs",
	"sulphites",
] as const;

export type AllergenSlug = (typeof ALLERGEN_SLUGS)[number];

/** Human-readable labels for each allergen slug. */
export const ALLERGEN_LABELS: Record<AllergenSlug, string> = {
	milk: "Milk / Dairy",
	eggs: "Eggs",
	fish: "Fish",
	shellfish: "Shellfish",
	"tree-nuts": "Tree Nuts",
	peanuts: "Peanuts",
	wheat: "Wheat / Gluten",
	soybeans: "Soybeans",
	sesame: "Sesame",
	mustard: "Mustard",
	celery: "Celery",
	lupin: "Lupin",
	molluscs: "Molluscs",
	sulphites: "Sulphites",
};

/**
 * Keyword synonyms to check for each allergen slug.
 * The slug itself is always included; these add common ingredient name variants.
 */
const ALLERGEN_KEYWORDS: Record<AllergenSlug, string[]> = {
	milk: [
		"milk",
		"dairy",
		"cream",
		"butter",
		"cheese",
		"yogurt",
		"yoghurt",
		"lactose",
		"whey",
		"casein",
	],
	eggs: ["egg", "eggs", "yolk", "albumin"],
	fish: [
		"fish",
		"salmon",
		"tuna",
		"cod",
		"haddock",
		"tilapia",
		"sardine",
		"anchovy",
		"bass",
		"trout",
		"halibut",
		"mackerel",
	],
	shellfish: [
		"shrimp",
		"prawn",
		"crab",
		"lobster",
		"crayfish",
		"scallop",
		"clam",
		"oyster",
		"mussel",
		"shellfish",
	],
	"tree-nuts": [
		"almond",
		"cashew",
		"walnut",
		"pecan",
		"pistachio",
		"hazelnut",
		"macadamia",
		"brazil nut",
		"pine nut",
		"tree nut",
	],
	peanuts: ["peanut", "groundnut", "peanut butter", "peanut oil"],
	wheat: [
		"wheat",
		"flour",
		"gluten",
		"bread",
		"pasta",
		"semolina",
		"spelt",
		"kamut",
		"bulgur",
		"couscous",
		"farro",
		"durum",
	],
	soybeans: ["soy", "soya", "tofu", "tempeh", "miso", "edamame", "soybean"],
	sesame: ["sesame", "tahini", "sesame oil", "sesame seed"],
	mustard: ["mustard", "mustard seed", "mustard powder"],
	celery: ["celery", "celeriac", "celery seed", "celery salt"],
	lupin: ["lupin", "lupine", "lupin flour", "lupin seed"],
	molluscs: ["squid", "octopus", "abalone", "snail", "mollusc", "mollusk"],
	sulphites: [
		"sulphite",
		"sulfite",
		"sulphur dioxide",
		"sulfur dioxide",
		"so2",
		"wine",
		"dried fruit",
		"vinegar",
	],
};

/**
 * Checks whether a list of ingredient names contains any of the given allergen slugs.
 * Returns the subset of allergens that were detected — empty array means safe.
 *
 * Matching is case-insensitive substring matching against the allergen keyword list.
 */
export function detectAllergens(
	ingredientNames: string[],
	allergens: AllergenSlug[],
): AllergenSlug[] {
	if (allergens.length === 0 || ingredientNames.length === 0) return [];

	const normalizedIngredients = ingredientNames.map((n) => n.toLowerCase());

	return allergens.filter((slug) => {
		const keywords = ALLERGEN_KEYWORDS[slug];
		return normalizedIngredients.some((ing) =>
			keywords.some((kw) => ing.includes(kw)),
		);
	});
}

/**
 * Returns true if a meal contains at least one of the given allergens.
 * Convenience wrapper around detectAllergens.
 */
export function mealContainsAllergen(
	ingredientNames: string[],
	allergens: AllergenSlug[],
): boolean {
	return detectAllergens(ingredientNames, allergens).length > 0;
}

/**
 * Builds the dietary_restrictions block for AI system prompts.
 * Returns an empty string when allergens is empty.
 */
export function buildAllergenPromptBlock(allergens: AllergenSlug[]): string {
	if (allergens.length === 0) return "";

	const labels = allergens.map((s) => ALLERGEN_LABELS[s]).join(", ");
	return `
<dietary_restrictions>
NEVER suggest or generate meals containing any of the following allergens or their derivatives: ${labels}.
This is a hard constraint. Do not include these ingredients even as optional, garnish, or trace ingredients.
</dietary_restrictions>`;
}

/** Type guard — narrows an unknown string to AllergenSlug. */
export function isAllergenSlug(value: unknown): value is AllergenSlug {
	return (
		typeof value === "string" &&
		(ALLERGEN_SLUGS as readonly string[]).includes(value)
	);
}

/** Filters an unknown array, keeping only valid AllergenSlug values. */
export function parseAllergens(raw: unknown): AllergenSlug[] {
	if (!Array.isArray(raw)) return [];
	return raw.filter(isAllergenSlug);
}
