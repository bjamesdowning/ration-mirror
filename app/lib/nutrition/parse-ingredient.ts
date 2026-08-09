import {
	normalizeUnitAlias,
	SUPPORTED_UNITS,
	type SupportedUnit,
	toSupportedUnit,
} from "~/lib/units";

export type ParsedIngredient = {
	quantity: number | null;
	unit: SupportedUnit | null;
	name: string;
	raw: string;
};

const UNIT_TOKEN_SET = new Set<string>([
	...SUPPORTED_UNITS,
	// Common plurals / aliases that normalizeUnitAlias understands
	"grams",
	"gram",
	"kilograms",
	"kilogram",
	"ounces",
	"ounce",
	"pounds",
	"pound",
	"lbs",
	"milliliters",
	"milliliter",
	"millilitres",
	"millilitre",
	"liters",
	"liter",
	"litres",
	"litre",
	"teaspoons",
	"teaspoon",
	"tablespoons",
	"tablespoon",
	"cups",
	"pints",
	"pint",
	"quarts",
	"quart",
	"gallons",
	"gallon",
	"pieces",
	"cloves",
	"slices",
	"cans",
	"packs",
	"bunches",
	"heads",
	"stalks",
	"sprigs",
	"dozens",
	"dozen",
	"units",
	"fluid",
	"fl",
]);

/**
 * Parses a free-text ingredient line into quantity, unit, and name.
 * Examples: "2 cups chopped onion", "100g chicken breast", "salt".
 */
export function parseIngredient(raw: string): ParsedIngredient {
	const trimmed = raw.trim().replace(/\s+/g, " ");
	if (!trimmed) {
		return { quantity: null, unit: null, name: "", raw };
	}

	// Leading mixed number / fraction / decimal: "1 1/2", "1½", "2.5", "1/2"
	const qtyMatch = trimmed.match(
		/^((?:\d+\s+\d+\/\d+)|(?:\d+\/\d+)|(?:\d+(?:\.\d+)?)|(?:[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]))\s*(.*)$/u,
	);

	if (!qtyMatch) {
		return { quantity: null, unit: null, name: trimmed, raw };
	}

	const quantity = parseQuantityToken(qtyMatch[1] ?? "");
	const rest = (qtyMatch[2] ?? "").trim();

	if (quantity === null) {
		return { quantity: null, unit: null, name: trimmed, raw };
	}

	// Compact unit glued to number already consumed; check "100g" style via original
	const glued = trimmed.match(/^((?:\d+(?:\.\d+)?))\s*([a-zA-Z]+)\b\s*(.*)$/);
	if (
		glued &&
		!/\s/.test(qtyMatch[1] ?? "") &&
		!String(qtyMatch[1]).includes("/")
	) {
		const maybeUnit = normalizeUnitToken(glued[2] ?? "");
		if (maybeUnit) {
			return {
				quantity: Number(glued[1]),
				unit: maybeUnit,
				name: (glued[3] ?? "").trim() || trimmed,
				raw,
			};
		}
	}

	// "fl oz" two-token unit
	const flOz = rest.match(/^(fl\.?\s*oz)\b\s*(.*)$/i);
	if (flOz) {
		return {
			quantity,
			unit: "fl oz",
			name: (flOz[2] ?? "").trim(),
			raw,
		};
	}

	const parts = rest.split(/\s+/);
	const first = parts[0]?.toLowerCase() ?? "";
	if (first && UNIT_TOKEN_SET.has(first)) {
		const unit = normalizeUnitToken(first);
		const name = parts.slice(1).join(" ").trim();
		return {
			quantity,
			unit,
			name: name || trimmed,
			raw,
		};
	}

	return {
		quantity,
		unit: null,
		name: rest || trimmed,
		raw,
	};
}

function normalizeUnitToken(token: string): SupportedUnit | null {
	const normalized = normalizeUnitAlias(token);
	const asSupported = toSupportedUnit(normalized);
	// Unknown tokens coerce to "unit" — only accept if alias/token was intentional
	const key = token.trim().toLowerCase().replace(/\s+/g, " ");
	if (asSupported === "unit") {
		if (
			key === "unit" ||
			key === "units" ||
			key === "piece" ||
			key === "pieces"
		) {
			return "unit";
		}
		return null;
	}
	return asSupported;
}

function parseQuantityToken(token: string): number | null {
	const t = token.trim();
	if (!t) return null;

	const unicode: Record<string, number> = {
		"½": 0.5,
		"⅓": 1 / 3,
		"⅔": 2 / 3,
		"¼": 0.25,
		"¾": 0.75,
		"⅕": 0.2,
		"⅖": 0.4,
		"⅗": 0.6,
		"⅘": 0.8,
		"⅙": 1 / 6,
		"⅚": 5 / 6,
		"⅛": 0.125,
		"⅜": 0.375,
		"⅝": 0.625,
		"⅞": 0.875,
	};
	if (t in unicode) return unicode[t] ?? null;

	const mixed = t.match(/^(\d+)\s+(\d+)\/(\d+)$/);
	if (mixed) {
		const whole = Number(mixed[1]);
		const num = Number(mixed[2]);
		const den = Number(mixed[3]);
		if (den === 0) return null;
		return whole + num / den;
	}

	const frac = t.match(/^(\d+)\/(\d+)$/);
	if (frac) {
		const num = Number(frac[1]);
		const den = Number(frac[2]);
		if (den === 0) return null;
		return num / den;
	}

	const n = Number(t);
	return Number.isFinite(n) ? n : null;
}
