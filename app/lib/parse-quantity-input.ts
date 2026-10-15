/**
 * Parses a free-text quantity typed by a person (public unit converter).
 * Accepts decimals with "." or ",", simple fractions ("1/2"), mixed numbers
 * ("1 1/2", "1-1/2") and unicode vulgar fractions ("½", "1½", "1 ½").
 */

const VULGAR_FRACTIONS: Record<string, number> = {
	"¼": 1 / 4,
	"½": 1 / 2,
	"¾": 3 / 4,
	"⅓": 1 / 3,
	"⅔": 2 / 3,
	"⅕": 1 / 5,
	"⅖": 2 / 5,
	"⅗": 3 / 5,
	"⅘": 4 / 5,
	"⅙": 1 / 6,
	"⅚": 5 / 6,
	"⅛": 1 / 8,
	"⅜": 3 / 8,
	"⅝": 5 / 8,
	"⅞": 7 / 8,
};

export type ParsedQuantityInput =
	| { ok: true; value: number }
	| { ok: false; reason: "empty" | "invalid" | "negative" | "too_large" };

/** Upper bound keeps results readable and avoids exponent output. */
export const MAX_QUANTITY_INPUT = 1_000_000;

const DECIMAL = String.raw`\d+(?:[.,]\d+)?|[.,]\d+`;
const DECIMAL_RE = new RegExp(`^(${DECIMAL})$`);
const FRACTION_RE = /^(\d+)\s*\/\s*(\d+)$/;
const MIXED_RE = /^(\d+)(?:\s+|\s*-\s*)(\d+)\s*\/\s*(\d+)$/;

function toNumber(decimal: string): number {
	return Number(decimal.replace(",", "."));
}

function parseMagnitude(raw: string): number | null {
	const vulgar = raw.match(/^(\d+)?\s*([¼½¾⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])$/);
	if (vulgar) {
		const whole = vulgar[1] ? Number(vulgar[1]) : 0;
		return whole + VULGAR_FRACTIONS[vulgar[2]];
	}
	const mixed = raw.match(MIXED_RE);
	if (mixed) {
		const den = Number(mixed[3]);
		if (den === 0) return null;
		return Number(mixed[1]) + Number(mixed[2]) / den;
	}
	const fraction = raw.match(FRACTION_RE);
	if (fraction) {
		const den = Number(fraction[2]);
		if (den === 0) return null;
		return Number(fraction[1]) / den;
	}
	const decimal = raw.match(DECIMAL_RE);
	if (decimal) return toNumber(decimal[1]);
	return null;
}

export function parseQuantityInput(input: string): ParsedQuantityInput {
	const trimmed = input.trim().replace(/\s+/g, " ");
	if (trimmed === "") return { ok: false, reason: "empty" };

	const negative = trimmed.startsWith("-");
	const body = negative ? trimmed.slice(1).trim() : trimmed;
	const value = parseMagnitude(body);
	if (value === null || !Number.isFinite(value)) {
		return { ok: false, reason: "invalid" };
	}
	if (negative && value !== 0) return { ok: false, reason: "negative" };
	if (value > MAX_QUANTITY_INPUT) return { ok: false, reason: "too_large" };
	return { ok: true, value };
}

export function quantityInputErrorMessage(
	reason: Extract<ParsedQuantityInput, { ok: false }>["reason"],
): string {
	switch (reason) {
		case "empty":
			return "Enter an amount, like 1, 1.5, 1/2 or 1 ½.";
		case "negative":
			return "Amounts can't be negative.";
		case "too_large":
			return "That amount is too large. Try something under 1,000,000.";
		default:
			return "We couldn't read that amount. Try 1, 1.5, 1,5, 1/2 or 1 ½.";
	}
}

/**
 * Formats a conversion result for display: up to 4 significant figures,
 * never exponent notation, thousands separators for large values.
 */
export function formatConversionResult(value: number): string {
	if (!Number.isFinite(value) || value < 0) return "—";
	if (value === 0) return "0";
	const rounded = Number(value.toPrecision(4));
	if (rounded >= 1) {
		return rounded.toLocaleString("en-US", { maximumFractionDigits: 3 });
	}
	return rounded.toLocaleString("en-US", { maximumSignificantDigits: 4 });
}
