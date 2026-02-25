import { ShoppingCart } from "lucide-react";
import type { supplyList } from "~/db/schema";
import { DOMAIN_ICONS, DOMAIN_LABELS, ITEM_DOMAINS } from "~/lib/domain";
import type { SupplyItemWithSource } from "~/lib/supply.server";
import { SupplyItem } from "./SupplyItem";

type SupplyListWithItems = typeof supplyList.$inferSelect & {
	items: SupplyItemWithSource[];
};

interface SupplyListProps {
	list: SupplyListWithItems;
	onRefresh?: () => void;
	filterDomain?: (typeof ITEM_DOMAINS)[number] | "all";
	filterSearch?: string;
}

type ItemDomain = (typeof ITEM_DOMAINS)[number];

export function SupplyList({
	list,
	onRefresh,
	filterDomain = "all",
	filterSearch = "",
}: SupplyListProps) {
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

	const groupedByDomain = domainFilteredItems.reduce<
		Record<ItemDomain, SupplyItemWithSource[]>
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
						Select meals in the Galley or add meals in the Manifest to populate
						your supply list. You can also add items manually using the form
						above.
					</p>
				</div>
			) : (
				<div className="space-y-6">
					{ITEM_DOMAINS.map((domain) => {
						const domainItems = groupedByDomain[domain];
						if (domainItems.length === 0) return null;

						const domainPurchased = domainItems.filter(
							(i) => i.isPurchased,
						).length;

						return (
							<section key={domain} className="space-y-4">
								<div className="flex items-center justify-between gap-3">
									<div className="flex items-center gap-3">
										{(() => {
											const Icon = DOMAIN_ICONS[domain];
											return <Icon className="w-5 h-5 text-hyper-green" />;
										})()}
										<h3 className="text-lg font-semibold text-carbon">
											{DOMAIN_LABELS[domain]}
										</h3>
									</div>
									<span className="text-data text-muted">
										{domainPurchased}/{domainItems.length}
									</span>
								</div>
								<div className="glass-panel rounded-xl p-4 space-y-1">
									{domainItems.map((item) => (
										<SupplyItem
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
