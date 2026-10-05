import { SUPPORTED_UNITS, type SupportedUnit } from "./units";

/** One jot, sized for a store-run paste. Widget and assistant entry reuse this parser. */
export const SUPPLY_QUICK_ADD_MAX = 80;

export type QuickAddItem = {
	name: string;
	quantity: number;
	unit: SupportedUnit;
	domain: "food" | "household";
};

const HOUSEHOLD_WORDS = new Set([
	"shampoo",
	"conditioner",
	"soap",
	"detergent",
	"toothpaste",
	"toothbrush",
	"bleach",
	"sponge",
	"sponges",
	"laundry",
	"tissue",
	"tissues",
	"deodorant",
	"floss",
]);

const UNITS_BY_LENGTH = [...SUPPORTED_UNITS].sort(
	(a, b) => b.length - a.length,
);

/**
 * Turn a grocery jot into items.
 * Commas, semicolons, and new lines separate items. "and" stays inside a name
 * so "bread and butter" is one line. A leading "I need" / "add" is ignored.
 * `2 lb chicken` and `2x milk` set quantity and unit.
 */
export function parseSupplyQuickAdd(text: string): QuickAddItem[] {
	const body = stripPreamble(text);
	if (!body) return [];

	const merged = new Map<string, QuickAddItem>();
	for (const chunk of body.split(/[\n,;]+/)) {
		const item = parseChunk(chunk);
		if (!item) continue;
		const key = `${item.name}::${item.unit}::${item.domain}`;
		const existing = merged.get(key);
		if (existing) {
			existing.quantity += item.quantity;
		} else {
			merged.set(key, item);
		}
		if (merged.size >= SUPPLY_QUICK_ADD_MAX) break;
	}
	return [...merged.values()];
}

function stripPreamble(text: string): string {
	let rest = text.trim();
	for (let pass = 0; pass < 3; pass++) {
		const next = rest
			.replace(/^(?:okay|ok|hey|please|um|uh|so|alright)[,.\s]+/i, "")
			.replace(
				/^(?:i |we )?(?:need|want|add|get|buy|grab|pick up)(?:\s+|$)/i,
				"",
			)
			.trim();
		if (next === rest) break;
		rest = next;
	}
	return rest;
}

function parseChunk(raw: string): QuickAddItem | null {
	let text = raw.trim().replace(/^[-*•]\s+/, "");
	text = text.replace(/^\d+[.)]\s+/, "").trim();
	if (!text) return null;

	let quantity = 1;
	let rest = text;
	const qty = text.match(/^(\d+(?:\.\d+)?)(?:\s*(?:x|×)\s*|\s+)(.+)$/i);
	if (qty?.[1] && qty[2]) {
		const parsed = Number(qty[1]);
		if (Number.isFinite(parsed) && parsed >= 0) {
			quantity = parsed;
			rest = qty[2].trim();
		}
	}

	const { unit, name } = splitUnit(rest);
	const cleaned = name
		.toLowerCase()
		.replace(/\s+/g, " ")
		.replace(/[.\s]+$/g, "")
		.trim();
	if (!cleaned || cleaned.length > 200) return null;
	return {
		name: cleaned,
		quantity,
		unit,
		domain: domainFor(cleaned),
	};
}

function splitUnit(rest: string): { unit: SupportedUnit; name: string } {
	const lower = rest.toLowerCase();
	for (const unit of UNITS_BY_LENGTH) {
		if (unit === "unit") continue;
		const escaped = unit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const matched = new RegExp(`^${escaped}(?:\\s+|$)`, "i").exec(lower);
		if (!matched) continue;
		const name = rest.slice(matched[0].length).trim();
		if (name) return { unit, name };
	}
	return { unit: "unit", name: rest };
}

function domainFor(name: string): "food" | "household" {
	if (name.includes("toilet paper") || name.includes("paper towel")) {
		return "household";
	}
	const words = name.split(" ");
	if (words.some((word) => HOUSEHOLD_WORDS.has(word))) return "household";
	return "food";
}
