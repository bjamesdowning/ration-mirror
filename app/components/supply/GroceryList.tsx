import type { groceryItem, groceryList } from "~/db/schema";
import { GroceryItem } from "./GroceryItem";

type GroceryListWithItems = typeof groceryList.$inferSelect & {
	items: (typeof groceryItem.$inferSelect)[];
};

interface GroceryListProps {
	list: GroceryListWithItems;
	onRefresh?: () => void;
}

export function GroceryList({ list, onRefresh }: GroceryListProps) {
	// Group items by category
	const groupedItems = list.items.reduce<
		Record<string, (typeof groceryItem.$inferSelect)[]>
	>((acc, item) => {
		const category = item.category || "other";
		if (!acc[category]) acc[category] = [];
		acc[category].push(item);
		return acc;
	}, {});

	const categoryNames: Record<string, string> = {
		dry_goods: "Dry Goods",
		cryo_frozen: "Frozen",
		perishable: "Refrigerated",
		produce: "Produce",
		canned: "Canned Goods",
		liquid: "Beverages & Liquids",
		other: "Other",
	};

	// Sort categories in a logical order
	const categoryOrder = [
		"produce",
		"perishable",
		"cryo_frozen",
		"dry_goods",
		"canned",
		"liquid",
		"other",
	];

	const sortedCategories = Object.keys(groupedItems).sort(
		(a, b) => categoryOrder.indexOf(a) - categoryOrder.indexOf(b),
	);

	return (
		<div className="space-y-6">
			{/* Items List */}
			{list.items.length === 0 ? (
				<div className="bg-platinum/50 rounded-xl p-8 text-center">
					<div className="text-4xl mb-4">🛒</div>
					<p className="text-lg text-muted">No items in this list yet</p>
					<p className="text-sm text-muted mt-2">
						Add items using the form above
					</p>
				</div>
			) : (
				<div className="glass-panel rounded-xl p-4 space-y-6">
					{sortedCategories.map((category) => {
						const items = groupedItems[category];
						const categoryPurchased = items.filter((i) => i.isPurchased).length;

						return (
							<section key={category}>
								<div className="flex items-center justify-between mb-3">
									<h3 className="text-label text-muted">
										{categoryNames[category] || category}
									</h3>
									<span className="text-data text-muted">
										{categoryPurchased}/{items.length}
									</span>
								</div>
								<div className="space-y-1">
									{items.map((item) => (
										<GroceryItem
											key={item.id}
											item={item}
											listId={list.id}
											onDelete={onRefresh}
										/>
									))}
								</div>
							</section>
						);
					})}
				</div>
			)}
		</div>
	);
}
