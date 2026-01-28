import { useState } from "react";
import type { groceryItem, groceryList } from "~/db/schema";
import { AddItemForm } from "./AddItemForm";
import { ExportMenu } from "./ExportMenu";
import { GroceryItem } from "./GroceryItem";
import { ShareModal } from "./ShareModal";

type GroceryListWithItems = typeof groceryList.$inferSelect & {
	items: (typeof groceryItem.$inferSelect)[];
};

interface GroceryListProps {
	list: GroceryListWithItems;
	onRefresh?: () => void;
}

export function GroceryList({ list, onRefresh }: GroceryListProps) {
	const [showShareModal, setShowShareModal] = useState(false);

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

	const purchased = list.items.filter((i) => i.isPurchased).length;
	const total = list.items.length;
	const progress = total > 0 ? Math.round((purchased / total) * 100) : 0;

	return (
		<div className="space-y-6">
			{/* Header Actions */}
			<div className="flex flex-wrap items-center justify-between gap-4">
				{/* Progress Bar */}
				<div className="flex items-center gap-4">
					<div className="text-label text-muted">Progress:</div>
					<div className="w-32 h-2 bg-platinum rounded-full overflow-hidden">
						<div
							className="h-full bg-hyper-green transition-all duration-300"
							style={{ width: `${progress}%` }}
						/>
					</div>
					<div className="text-sm text-data text-carbon">
						{purchased}/{total}
					</div>
				</div>

				{/* Actions */}
				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={() => setShowShareModal(true)}
						className="flex items-center gap-2 px-4 py-2 bg-platinum text-carbon rounded-lg hover:bg-platinum/80 transition-colors"
					>
						<svg
							aria-hidden="true"
							className="w-4 h-4"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
							/>
						</svg>
						Share
					</button>
					<ExportMenu listId={list.id} />
				</div>
			</div>

			{/* Add Item Form */}
			<AddItemForm listId={list.id} onAdd={onRefresh} />

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

			{/* Share Modal */}
			{showShareModal && (
				<ShareModal
					listId={list.id}
					existingShareToken={list.shareToken}
					onClose={() => setShowShareModal(false)}
				/>
			)}
		</div>
	);
}
