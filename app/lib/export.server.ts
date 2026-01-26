import type { groceryItem, groceryList } from "../db/schema";

type GroceryListWithItems = typeof groceryList.$inferSelect & {
	items: (typeof groceryItem.$inferSelect)[];
};

/**
 * Exports a grocery list as plain text.
 * Groups items by category and formats them for easy copying.
 */
export function exportGroceryListAsText(list: GroceryListWithItems): string {
	const lines: string[] = [];

	// Header
	lines.push(`📋 ${list.name}`);
	lines.push(`${"─".repeat(30)}`);
	lines.push("");

	if (list.items.length === 0) {
		lines.push("No items in list");
		return lines.join("\n");
	}

	// Group items by category
	const itemsByCategory = groupItemsByCategory(list.items);

	// Format each category
	for (const [category, items] of Object.entries(itemsByCategory)) {
		lines.push(`## ${formatCategoryName(category)}`);

		for (const item of items) {
			const checkbox = item.isPurchased ? "☑" : "☐";
			const quantityStr =
				item.quantity > 1 ? `${item.quantity} ${item.unit}` : item.unit;
			lines.push(`${checkbox} ${item.name} (${quantityStr})`);
		}

		lines.push("");
	}

	// Summary
	const purchased = list.items.filter((i) => i.isPurchased).length;
	const total = list.items.length;
	lines.push(`${"─".repeat(30)}`);
	lines.push(`Progress: ${purchased}/${total} items purchased`);

	return lines.join("\n");
}

/**
 * Exports a grocery list as Markdown format.
 */
export function exportGroceryListAsMarkdown(
	list: GroceryListWithItems,
): string {
	const lines: string[] = [];

	// Header
	lines.push(`# ${list.name}`);
	lines.push("");

	if (list.items.length === 0) {
		lines.push("*No items in list*");
		return lines.join("\n");
	}

	// Group items by category
	const itemsByCategory = groupItemsByCategory(list.items);

	// Format each category
	for (const [category, items] of Object.entries(itemsByCategory)) {
		lines.push(`## ${formatCategoryName(category)}`);
		lines.push("");

		for (const item of items) {
			const checkbox = item.isPurchased ? "[x]" : "[ ]";
			const quantityStr =
				item.quantity > 1 ? `${item.quantity} ${item.unit}` : "";
			const suffix = quantityStr ? ` *(${quantityStr})*` : "";
			lines.push(`- ${checkbox} ${item.name}${suffix}`);
		}

		lines.push("");
	}

	return lines.join("\n");
}

/**
 * Groups grocery items by category.
 */
function groupItemsByCategory(
	items: (typeof groceryItem.$inferSelect)[],
): Record<string, (typeof groceryItem.$inferSelect)[]> {
	const groups: Record<string, (typeof groceryItem.$inferSelect)[]> = {};

	for (const item of items) {
		const category = item.category || "other";
		if (!groups[category]) {
			groups[category] = [];
		}
		groups[category].push(item);
	}

	// Sort items within each category alphabetically
	for (const category of Object.keys(groups)) {
		groups[category].sort((a, b) => a.name.localeCompare(b.name));
	}

	return groups;
}

/**
 * Formats a category slug into a human-readable name.
 */
function formatCategoryName(category: string): string {
	const categoryNames: Record<string, string> = {
		dry_goods: "Dry Goods",
		cryo_frozen: "Frozen",
		perishable: "Refrigerated",
		produce: "Produce",
		canned: "Canned Goods",
		liquid: "Beverages & Liquids",
		other: "Other",
	};

	return categoryNames[category] || category.replace(/_/g, " ").toUpperCase();
}
