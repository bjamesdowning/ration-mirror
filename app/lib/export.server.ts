import type { groceryItem, groceryList } from "../db/schema";
import { DOMAIN_LABELS } from "./domain";

type GroceryListWithItems = typeof groceryList.$inferSelect & {
	items: (typeof groceryItem.$inferSelect)[];
};

/**
 * Exports a grocery list as plain text.
 * Groups items by domain and formats them for easy copying.
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

	// Group items by domain
	const itemsByDomain = groupItemsByDomain(list.items);

	// Format each domain
	for (const [domain, items] of Object.entries(itemsByDomain)) {
		lines.push(`## ${formatDomainName(domain)}`);

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

	// Group items by domain
	const itemsByDomain = groupItemsByDomain(list.items);

	// Format each domain
	for (const [domain, items] of Object.entries(itemsByDomain)) {
		lines.push(`## ${formatDomainName(domain)}`);
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
 * Groups grocery items by domain.
 */
function groupItemsByDomain(
	items: (typeof groceryItem.$inferSelect)[],
): Record<string, (typeof groceryItem.$inferSelect)[]> {
	const groups: Record<string, (typeof groceryItem.$inferSelect)[]> = {};

	for (const item of items) {
		const domain = item.domain || "food";
		if (!groups[domain]) {
			groups[domain] = [];
		}
		groups[domain].push(item);
	}

	// Sort items within each domain alphabetically
	for (const domain of Object.keys(groups)) {
		groups[domain].sort((a, b) => a.name.localeCompare(b.name));
	}

	return groups;
}

/**
 * Formats a domain slug into a human-readable name.
 */
function formatDomainName(domain: string): string {
	return (
		DOMAIN_LABELS[domain as keyof typeof DOMAIN_LABELS] ||
		domain.replace(/_/g, " ").toUpperCase()
	);
}
