import { ShoppingCart } from "lucide-react";
import type { supplyList } from "~/db/schema";
import type { CargoLinkRow } from "~/lib/cargo-links";
import { DOMAIN_ICONS, DOMAIN_LABELS, ITEM_DOMAINS } from "~/lib/domain";
import type { SupplyItemWithSource } from "~/lib/supply.server";
import {
	isSupplyCategory,
	SUPPLY_CATEGORIES,
	SUPPLY_CATEGORY_LABELS,
	type SupplyCategory,
} from "~/lib/supply-categories";
import { type SupplySortMode, sortSupplyItems } from "~/lib/supply-sort";
import { SupplyItem } from "./SupplyItem";

type SupplyListWithItems = typeof supplyList.$inferSelect & {
	items: SupplyItemWithSource[];
};

interface SupplyListProps {
	list: SupplyListWithItems;
	cargoRows?: CargoLinkRow[];
	mealTagsByMealId?: Map<string, string[]>;
	onRefresh?: () => void;
	filterDomain?: (typeof ITEM_DOMAINS)[number] | "all";
	filterSearch?: string;
	sortMode?: SupplySortMode;
	aisleOrder?: string[];
}

type ItemDomain = (typeof ITEM_DOMAINS)[number];

function resolveCategory(item: SupplyItemWithSource): SupplyCategory {
	return isSupplyCategory(item.category) ? item.category : "other";
}

export function SupplyList({
	list,
	cargoRows = [],
	mealTagsByMealId,
	onRefresh,
	filterDomain = "all",
	filterSearch = "",
	sortMode = "alpha",
	aisleOrder,
}: SupplyListProps) {
	let filteredItems =
		filterDomain === "all"
			? list.items
			: list.items.filter((item) => item.domain === filterDomain);

	if (filterSearch.trim()) {
		const query = filterSearch.toLowerCase();
		filteredItems = filteredItems.filter((item) =>
			item.name.toLowerCase().includes(query),
		);
	}

	const domainFilteredItems = filteredItems;
	const useAisleGroups = domainFilteredItems.some((item) => item.category);
	const categoryOrder = aisleOrder?.length
		? aisleOrder
		: [...SUPPLY_CATEGORIES];

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

	const groupedByCategory = domainFilteredItems.reduce<
		Record<string, SupplyItemWithSource[]>
	>((acc, item) => {
		const key = resolveCategory(item);
		acc[key] = acc[key] ?? [];
		acc[key].push(item);
		return acc;
	}, {});

	const renderItems = (items: SupplyItemWithSource[]) =>
		items.map((item) => (
			<SupplyItem
				key={item.id}
				item={item}
				listId={list.id}
				cargoRows={cargoRows}
				mealTagsByMealId={mealTagsByMealId}
				onDelete={onRefresh}
				onSnooze={onRefresh}
				onRefresh={onRefresh}
			/>
		));

	return (
		<div className="space-y-6">
			{domainFilteredItems.length === 0 ? (
				<div className="bg-platinum/50 rounded-xl p-8 text-center">
					<ShoppingCart className="w-16 h-16 mx-auto mb-4 text-muted" />
					<p className="text-lg text-muted">No items in this list yet</p>
					<p className="text-sm text-muted mt-2">
						Select meals in Galley, plan meals in Manifest, or mark Cargo items
						for restock. You can also add items manually using the form above.
					</p>
				</div>
			) : useAisleGroups ? (
				<div className="space-y-6">
					{categoryOrder.map((category) => {
						const categoryItems = sortSupplyItems(
							groupedByCategory[category] ?? [],
							sortMode,
						);
						if (categoryItems.length === 0) return null;
						const purchased = categoryItems.filter((i) => i.isPurchased).length;
						const label = isSupplyCategory(category)
							? SUPPLY_CATEGORY_LABELS[category]
							: "Other";
						return (
							<section key={category} className="space-y-2 md:space-y-4">
								<div className="flex items-center justify-between gap-3 px-1">
									<h3 className="text-base md:text-lg font-semibold text-carbon dark:text-white">
										{label}
									</h3>
									<span className="text-data text-muted text-sm">
										{purchased}/{categoryItems.length}
									</span>
								</div>
								<div className="divide-y divide-platinum dark:divide-white/10 md:glass-panel md:rounded-xl md:p-4">
									{renderItems(categoryItems)}
								</div>
							</section>
						);
					})}
				</div>
			) : (
				<div className="space-y-6">
					{ITEM_DOMAINS.map((domain) => {
						const domainItems = sortSupplyItems(
							groupedByDomain[domain],
							sortMode,
						);
						if (domainItems.length === 0) return null;

						const domainPurchased = domainItems.filter(
							(i) => i.isPurchased,
						).length;

						return (
							<section key={domain} className="space-y-2 md:space-y-4">
								<div className="flex items-center justify-between gap-3 px-1">
									<div className="flex items-center gap-2 md:gap-3">
										{(() => {
											const Icon = DOMAIN_ICONS[domain];
											return (
												<Icon className="w-4 h-4 md:w-5 md:h-5 text-hyper-green" />
											);
										})()}
										<h3 className="text-base md:text-lg font-semibold text-carbon dark:text-white">
											{DOMAIN_LABELS[domain]}
										</h3>
									</div>
									<span className="text-data text-muted text-sm">
										{domainPurchased}/{domainItems.length}
									</span>
								</div>
								<div className="divide-y divide-platinum dark:divide-white/10 md:glass-panel md:rounded-xl md:p-4">
									{renderItems(domainItems)}
								</div>
							</section>
						);
					})}
				</div>
			)}
		</div>
	);
}
