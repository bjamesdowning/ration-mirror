/**
 * Ingredient density lookup for mass-to-volume conversion.
 * Density values in g/ml. Source: King Arthur Baking, USDA, gramstocups.io.
 *
 * Use normalizeForMatch(name) for lookup keys. Aliases map variants to canonical keys.
 */

import { normalizeForMatch } from "./matching";

/** Density in g/ml (grams per milliliter). Bounded 0.1-3.0 for validation. */
export type DensityGPerMl = number;

const DENSITY_MIN = 0.1;
const DENSITY_MAX = 3.0;

/**
 * Canonical ingredient keys (normalized) -> density in g/ml.
 * Keys use same normalization as normalizeForMatch (lowercase, no punctuation, single spaces).
 */
const DENSITY_CANONICAL: Record<string, DensityGPerMl> = {
	// Flours and starches
	"all purpose flour": 0.53,
	"allpurpose flour": 0.53,
	"plain flour": 0.53,
	"ap flour": 0.53,
	"white flour": 0.53,
	"bread flour": 0.54,
	"cake flour": 0.48,
	"self raising flour": 0.53,
	"selfraising flour": 0.53,
	"self rising flour": 0.53,
	"whole wheat flour": 0.5,
	"wholemeal flour": 0.5,
	"whole wheat": 0.5,
	wholemeal: 0.5,
	"semolina flour": 0.71,
	semolina: 0.71,
	"almond flour": 0.41,
	"almond meal": 0.41,
	"coconut flour": 0.35,
	"oat flour": 0.42,
	"corn flour": 0.48,
	cornstarch: 0.38,
	"corn starch": 0.38,
	"potato starch": 0.4,
	"tapioca starch": 0.38,
	"rice flour": 0.5,
	"buckwheat flour": 0.52,
	"rye flour": 0.5,
	"spelt flour": 0.48,
	"chickpea flour": 0.5,
	"besan flour": 0.5,
	"00 flour": 0.53,
	"strong bread flour": 0.54,
	"strong flour": 0.54,
	"pastry flour": 0.5,
	"graham flour": 0.5,

	// Sugars and sweeteners
	"granulated sugar": 0.85,
	"white sugar": 0.85,
	"caster sugar": 0.88,
	"superfine sugar": 0.88,
	"powdered sugar": 0.51,
	"icing sugar": 0.51,
	"confectioners sugar": 0.51,
	"brown sugar": 0.93,
	"light brown sugar": 0.9,
	"dark brown sugar": 0.93,
	"demerara sugar": 0.88,
	"muscovado sugar": 0.93,
	"turbinado sugar": 0.88,
	"raw sugar": 0.88,
	"coconut sugar": 0.85,
	"maple sugar": 0.9,
	honey: 1.44,
	"maple syrup": 1.36,
	molasses: 1.39,
	"golden syrup": 1.38,
	"corn syrup": 1.36,
	"agave syrup": 1.4,
	"rice syrup": 1.36,

	// Fats and oils
	butter: 0.96,
	"unsalted butter": 0.96,
	"salted butter": 0.96,
	"vegetable oil": 0.92,
	"olive oil": 0.92,
	"canola oil": 0.92,
	"coconut oil": 0.92,
	"rapeseed oil": 0.92,
	"sunflower oil": 0.92,
	shortening: 0.93,
	lard: 0.9,
	margarine: 0.93,
	ghee: 0.96,
	"peanut butter": 1.0,
	"almond butter": 0.98,
	tahini: 1.0,
	"sesame paste": 1.0,

	// Liquids
	water: 1.0,
	milk: 1.03,
	"whole milk": 1.03,
	"skim milk": 1.03,
	cream: 1.0,
	"heavy cream": 1.0,
	"double cream": 1.0,
	"single cream": 0.98,
	"sour cream": 1.0,
	yogurt: 1.03,
	"greek yogurt": 1.06,
	"plain yogurt": 1.03,
	buttermilk: 1.03,
	"evaporated milk": 1.08,
	"condensed milk": 1.3,
	"sweetened condensed milk": 1.3,
	"coconut milk": 0.96,
	"almond milk": 1.0,
	"oat milk": 1.0,
	"soy milk": 1.02,
	stock: 1.0,
	broth: 1.0,
	"chicken stock": 1.0,
	"vegetable stock": 1.0,
	"beef stock": 1.0,
	wine: 0.99,
	"red wine": 0.99,
	"white wine": 0.99,
	vinegar: 1.0,
	"apple cider vinegar": 1.0,
	"white vinegar": 1.0,
	"rice vinegar": 1.0,
	"lemon juice": 1.03,
	"lime juice": 1.02,
	"orange juice": 1.04,
	"tomato paste": 1.1,
	"tomato puree": 1.02,
	passata: 1.02,
	"soy sauce": 1.1,
	"worcestershire sauce": 1.05,

	// Leavening and dry goods
	"baking powder": 0.9,
	"baking soda": 0.87,
	"bicarbonate of soda": 0.87,
	"bicarb soda": 0.87,
	salt: 1.2,
	"table salt": 1.2,
	"sea salt": 1.2,
	"kosher salt": 1.0,
	"flaky salt": 0.9,
	"cocoa powder": 0.35,
	"cacao powder": 0.35,
	"dutch cocoa": 0.35,
	"chocolate chips": 0.6,
	"dark chocolate chips": 0.6,
	"milk chocolate chips": 0.6,
	nuts: 0.6,
	"ground almonds": 0.43,
	"desiccated coconut": 0.35,
	"shredded coconut": 0.32,
	"flaked coconut": 0.3,
	"walnuts chopped": 0.45,
	"pecans chopped": 0.45,
	cashews: 0.6,
	hazelnuts: 0.63,
	peanuts: 0.6,
	pecans: 0.55,
	walnuts: 0.5,
	pistachios: 0.56,
	"ground nuts": 0.5,
	"nut meal": 0.45,

	// Grains
	rice: 0.85,
	"white rice": 0.85,
	"brown rice": 0.85,
	"basmati rice": 0.85,
	"jasmine rice": 0.85,
	"risotto rice": 0.85,
	"arborio rice": 0.85,
	oats: 0.35,
	"rolled oats": 0.35,
	"porridge oats": 0.35,
	"quick oats": 0.38,
	oatmeal: 0.35,
	"steel cut oats": 0.4,
	quinoa: 0.72,
	couscous: 0.65,
	bulgur: 0.6,
	polenta: 0.7,
	cornmeal: 0.55,
	grits: 0.55,
	panko: 0.25,
	breadcrumbs: 0.3,
	"dried breadcrumbs": 0.25,

	// Cheese and dairy solids
	"parmesan cheese grated": 0.45,
	"parmesan grated": 0.45,
	"cheddar cheese grated": 0.45,
	"mozzarella grated": 0.35,
	"cream cheese": 0.98,
	ricotta: 0.52,
	"feta cheese": 0.55,
	"blue cheese crumbled": 0.5,
	"goat cheese": 0.55,
	mascarpone: 0.95,
	"cottage cheese": 0.8,

	// Proteins and spreads
	mayonnaise: 0.91,
	mustard: 1.0,
	"dijon mustard": 1.0,
	ketchup: 1.05,
	"bbq sauce": 1.05,

	// Fruits and vegetables (measured by volume when used as puree/paste)
	"mashed banana": 0.95,
	"banana mashed": 0.95,
	"apple sauce": 1.0,
	applesauce: 1.0,
	"pumpkin puree": 1.0,
	"canned pumpkin": 1.0,
	"sweet potato puree": 1.0,
	"avocado mashed": 0.96,
	"mashed avocado": 0.96,
	"tomato sauce": 1.02,
	"crushed tomatoes": 1.02,

	// Baking essentials
	"vanilla extract": 0.88,
	"vanilla essence": 0.88,
	"instant yeast": 0.6,
	"active dry yeast": 0.5,
	"dried yeast": 0.5,
	"fresh yeast": 0.65,
	gelatin: 0.9,
	gelatine: 0.9,
	pectin: 0.5,

	// Herbs and spices (ground, for volume-to-weight)
	"ground cinnamon": 0.56,
	cinnamon: 0.56,
	"ground ginger": 0.5,
	"ginger powder": 0.5,
	"ground nutmeg": 0.5,
	nutmeg: 0.5,
	paprika: 0.5,
	"chili powder": 0.5,
	cumin: 0.5,
	"ground cumin": 0.5,
	turmeric: 0.5,
	oregano: 0.25,
	"basil dried": 0.25,
	"thyme dried": 0.25,
	"parsley dried": 0.25,
	"onion powder": 0.5,
	"garlic powder": 0.5,

	// Generic fallbacks
	flour: 0.53,
	sugar: 0.85,
};

/**
 * Aliases: normalized variant -> canonical key.
 * Use when the exact string isn't in DENSITY_CANONICAL but a synonym is.
 */
const DENSITY_ALIASES: Record<string, string> = {
	// Flour variants
	"plain flour": "all purpose flour",
	"allpurpose flour": "all purpose flour",
	"ap flour": "all purpose flour",
	"white flour": "all purpose flour",
	"self raising flour": "self rising flour",
	"selfraising flour": "self rising flour",
	"wholemeal flour": "whole wheat flour",
	wholemeal: "whole wheat flour",
	"strong flour": "bread flour",
	"strong bread flour": "bread flour",
	"00 flour": "all purpose flour",

	// Sugar variants
	"white sugar": "granulated sugar",
	"superfine sugar": "caster sugar",
	"icing sugar": "powdered sugar",
	"confectioners sugar": "powdered sugar",
	"light brown sugar": "brown sugar",
	"dark brown sugar": "brown sugar",
	"muscovado sugar": "brown sugar",
	"turbinado sugar": "demerara sugar",
	"raw sugar": "demerara sugar",

	// Butter and fats
	"unsalted butter": "butter",
	"salted butter": "butter",
	"rapeseed oil": "canola oil",

	// Dairy
	"skim milk": "milk",
	"whole milk": "milk",
	"heavy cream": "cream",
	"double cream": "cream",
	"single cream": "cream",
	"greek yogurt": "yogurt",
	"plain yogurt": "yogurt",

	// Leavening
	"bicarbonate of soda": "baking soda",
	"bicarb soda": "baking soda",
	"table salt": "salt",
	"sea salt": "salt",
	"dutch cocoa": "cocoa powder",
	"cacao powder": "cocoa powder",

	// Grains
	"white rice": "rice",
	"brown rice": "rice",
	"basmati rice": "rice",
	"jasmine rice": "rice",
	"risotto rice": "rice",
	"arborio rice": "rice",
	"rolled oats": "oats",
	"porridge oats": "oats",
	oatmeal: "oats",
	"quick oats": "oats",
	"steel cut oats": "oats",

	// Coconut
	"desiccated coconut": "coconut flour",
	"shredded coconut": "coconut flour",
	"flaked coconut": "coconut flour",

	// Stock/broth
	stock: "water",
	broth: "water",
	"chicken stock": "water",
	"vegetable stock": "water",
	"beef stock": "water",

	// Misc
	"tomato puree": "passata",
	"crushed tomatoes": "tomato sauce",
	"mashed banana": "banana mashed",
	applesauce: "apple sauce",
	"canned pumpkin": "pumpkin puree",
	"mashed avocado": "avocado mashed",
	"vanilla essence": "vanilla extract",
	"dried yeast": "active dry yeast",
	"fresh yeast": "instant yeast",
	gelatine: "gelatin",
	"ginger powder": "ground ginger",
	"ground nutmeg": "nutmeg",
	"ground cumin": "cumin",
	"almond meal": "almond flour",
};

const LIQUID_HINTS = new Set<string>([
	"water",
	"milk",
	"cream",
	"broth",
	"stock",
	"oil",
	"vinegar",
	"juice",
	"wine",
	"sauce",
	"syrup",
	"extract",
]);

/**
 * Normalizes a name for density lookup.
 * Matches matching.server.ts normalizeIngredientName: lowercase, trim, remove punctuation, strip trailing 's'.
 */
function normalizeForDensityLookup(name: string): string {
	const base = normalizeForMatch(name);
	// Strip trailing 's' for plural handling (e.g. "flours" -> "flour")
	return base.replace(/\s*s$/, "").trim() || base;
}

/**
 * Looks up ingredient density in g/ml by name.
 * Returns null if not found or density is invalid.
 */
export function lookupDensity(
	name: string | null | undefined,
): DensityGPerMl | null {
	if (name == null || String(name).trim() === "") return null;

	const normalized = normalizeForDensityLookup(String(name));
	if (!normalized) return null;

	const canonical = DENSITY_ALIASES[normalized] ?? normalized;
	const density = DENSITY_CANONICAL[canonical];
	if (density == null || typeof density !== "number") return null;

	// Bounds check
	if (density < DENSITY_MIN || density > DENSITY_MAX) return null;
	return density;
}

/**
 * Heuristic classifier for liquid-like ingredients so unit conversion can favor
 * store-friendly volume units (ml/l) instead of weight where appropriate.
 */
export function isLikelyLiquidIngredient(
	name: string | null | undefined,
): boolean {
	if (name == null || String(name).trim() === "") return false;
	const normalized = normalizeForDensityLookup(String(name));
	if (!normalized) return false;
	const canonical = DENSITY_ALIASES[normalized] ?? normalized;
	const density = DENSITY_CANONICAL[canonical];
	if (typeof density === "number" && density >= 0.9 && density <= 1.15) {
		return true;
	}

	const tokens = canonical.split(" ");
	return tokens.some((token) => LIQUID_HINTS.has(token));
}
