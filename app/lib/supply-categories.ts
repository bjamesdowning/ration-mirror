export const SUPPLY_CATEGORIES = [
	"produce",
	"bakery",
	"meat_seafood",
	"dairy",
	"pantry",
	"frozen",
	"beverages",
	"household",
	"alcohol",
	"other",
] as const;

export type SupplyCategory = (typeof SUPPLY_CATEGORIES)[number];

export const SUPPLY_CATEGORY_LABELS: Record<SupplyCategory, string> = {
	produce: "Produce",
	bakery: "Bakery",
	meat_seafood: "Meat / Seafood",
	dairy: "Dairy",
	pantry: "Pantry",
	frozen: "Frozen",
	beverages: "Beverages",
	household: "Household",
	alcohol: "Alcohol",
	other: "Other",
};

export function isSupplyCategory(value: unknown): value is SupplyCategory {
	return (
		typeof value === "string" &&
		(SUPPLY_CATEGORIES as readonly string[]).includes(value)
	);
}

const TAG_CATEGORY_TO_SUPPLY: Record<string, SupplyCategory> = {
	produce: "produce",
	bakery: "bakery",
	meat: "meat_seafood",
	seafood: "meat_seafood",
	dairy: "dairy",
	pantry: "pantry",
	frozen: "frozen",
	beverage: "beverages",
	beverages: "beverages",
	household: "household",
	alcohol: "alcohol",
};

export function inferSupplyCategory(input: {
	domain?: string | null;
	tagCategory?: string | null;
}): SupplyCategory {
	const tag = input.tagCategory?.trim().toLowerCase();
	if (tag && TAG_CATEGORY_TO_SUPPLY[tag]) return TAG_CATEGORY_TO_SUPPLY[tag];
	if (input.domain === "household") return "household";
	if (input.domain === "alcohol") return "alcohol";
	return "other";
}

export function categorySortIndex(
	category: string | null | undefined,
	order: string[] = [...SUPPLY_CATEGORIES],
): number {
	const key = category && isSupplyCategory(category) ? category : "other";
	const idx = order.indexOf(key);
	return idx === -1 ? order.length : idx;
}
