import { ShoppingCart } from "lucide-react";
import type { groceryItem, groceryList } from "~/db/schema";
import { DOMAIN_ICONS, DOMAIN_LABELS, ITEM_DOMAINS } from "~/lib/domain";
import { GroceryItem } from "./GroceryItem";

type GroceryListWithItems = typeof groceryList.$inferSelect & {
	items: (typeof groceryItem.$inferSelect)[];
};

interface GroceryListProps {
	list: GroceryListWithItems;
	onRefresh?: () => void;
	filterDomain?: (typeof ITEM_DOMAINS)[number] | "all";
	filterSearch?: string;
}

type ItemDomain = (typeof ITEM_DOMAINS)[number];

export function GroceryList({
	list,
	onRefresh,
	filterDomain = "all",
	filterSearch = "",
}: GroceryListProps) {
	// Apply domain filter
	let filteredItems =
		filterDomain === "all"
			? list.items
			: list.items.filter((item) => item.domain === filterDomain);

	// Apply search filter
	if (filterSearch.trim()) {
		const query = filterSearch.toLowerCase();
		filteredItems = filteredItems.filter((item) =>
			item.name.toLowerCase().includes(query),
		);
	}

	const domainFilteredItems = filteredItems;

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

	const groupedByDomain = domainFilteredItems.reduce<
		Record<ItemDomain, (typeof groceryItem.$inferSelect)[]>
	>(
		(acc, item) => {
			const domain = (item.domain ?? "food") as ItemDomain;
			acc[domain].push(item);
			return acc;
		},
		{
			food: [],
			household: [],
			alcohol: [],
		},
	);

	return (
		<div className="space-y-6">
			{/* Items List */}
			{domainFilteredItems.length === 0 ? (
				<div className="bg-platinum/50 rounded-xl p-8 text-center">
					<ShoppingCart className="w-16 h-16 mx-auto mb-4 text-muted" />
					<p className="text-lg text-muted">No items in this list yet</p>
					<p className="text-sm text-muted mt-2">
						Add items using the form above
					</p>
				</div>
			) : (
				<div className="space-y-6">
					{ITEM_DOMAINS.map((domain) => {
						const domainItems = groupedByDomain[domain];
						if (domainItems.length === 0) return null;

						const groupedItems = domainItems.reduce<
							Record<string, (typeof groceryItem.$inferSelect)[]>
						>((acc, item) => {
							const category = item.category || "other";
							if (!acc[category]) acc[category] = [];
							acc[category].push(item);
							return acc;
						}, {});

						const sortedCategories = Object.keys(groupedItems).sort(
							(a, b) => categoryOrder.indexOf(a) - categoryOrder.indexOf(b),
						);

						return (
							<section key={domain} className="space-y-4">
								<div className="flex items-center gap-3">
									{(() => {
										const Icon = DOMAIN_ICONS[domain];
										return <Icon className="w-5 h-5 text-hyper-green" />;
									})()}
									<h3 className="text-lg font-semibold text-carbon">
										{DOMAIN_LABELS[domain]}
									</h3>
								</div>
								<div className="glass-panel rounded-xl p-4 space-y-6">
									{sortedCategories.map((category) => {
										const items = groupedItems[category];
										const categoryPurchased = items.filter(
											(i) => i.isPurchased,
										).length;

										return (
											<section key={`${domain}-${category}`}>
												<div className="flex items-center justify-between mb-3">
													<h4 className="text-label text-muted">
														{categoryNames[category] || category}
													</h4>
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
							</section>
						);
					})}
				</div>
			)}
		</div>
	);
}
