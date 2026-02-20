import { Link } from "react-router";
import type { supplyItem, supplyList } from "~/db/schema";
import { CheckIcon, GroceryIcon, ListIcon } from "../icons/HubIcons";

type SupplyListWithItems = typeof supplyList.$inferSelect & {
	items: (typeof supplyItem.$inferSelect)[];
};

interface SupplyPreviewCardProps {
	list: SupplyListWithItems | null;
}

export function SupplyPreviewCard({ list }: SupplyPreviewCardProps) {
	if (!list) {
		return (
			<div className="glass-panel rounded-xl p-6 h-full">
				{/* Header */}
				<div className="flex items-start justify-between mb-4">
					<div className="flex items-center gap-2">
						<GroceryIcon />
						<div>
							<h3 className="text-label text-carbon font-bold">Supply List</h3>
							<p className="text-xs text-muted mt-1">Your shopping list</p>
						</div>
					</div>
				</div>

				{/* Empty State */}
				<div className="text-center py-6 flex flex-col items-center">
					<ListIcon />
					<p className="text-sm text-muted mb-4 mt-3">No supply list yet</p>
					<Link
						to="/hub/supply"
						className="inline-block text-xs bg-hyper-green text-carbon font-bold px-4 py-2 rounded-lg hover:shadow-glow-sm transition-all"
					>
						Create List
					</Link>
				</div>
			</div>
		);
	}

	const purchasedCount = list.items.filter((item) => item.isPurchased).length;
	const totalCount = list.items.length;
	const progress = totalCount > 0 ? (purchasedCount / totalCount) * 100 : 0;

	return (
		<div className="glass-panel rounded-xl p-6 h-full">
			{/* Header */}
			<div className="flex items-start justify-between mb-4">
				<div className="flex items-center gap-2">
					<GroceryIcon />
					<div>
						<h3 className="text-label text-carbon font-bold">Supply List</h3>
						<p className="text-xs text-muted mt-1">{list.name}</p>
					</div>
				</div>
				<span className="text-xs text-muted">
					{purchasedCount}/{totalCount}
				</span>
			</div>

			{/* Progress Bar */}
			<div className="mb-4">
				<div className="h-2 bg-platinum rounded-full overflow-hidden">
					<div
						className="h-full bg-hyper-green transition-all duration-300"
						style={{ width: `${progress}%` }}
					/>
				</div>
			</div>

			{/* Items Preview */}
			{list.items.length > 0 ? (
				<ul className="space-y-2">
					{list.items.slice(0, 5).map((item) => (
						<li
							key={item.id}
							className={`flex items-center gap-2 text-sm ${
								item.isPurchased ? "line-through text-muted" : "text-carbon"
							}`}
						>
							<span
								className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center text-xs ${
									item.isPurchased
										? "bg-hyper-green/20 border-hyper-green text-hyper-green"
										: "border-carbon/30"
								}`}
							>
								{item.isPurchased && <CheckIcon className="w-3 h-3" />}
							</span>
							<span className="truncate">
								{item.name}
								{item.quantity > 1 && (
									<span className="text-muted ml-1">×{item.quantity}</span>
								)}
							</span>
						</li>
					))}
					{list.items.length > 5 && (
						<li className="text-xs text-muted pl-6">
							+{list.items.length - 5} more items
						</li>
					)}
				</ul>
			) : (
				<p className="text-sm text-muted text-center py-4">
					No items in this list
				</p>
			)}

			{/* Footer Link */}
			<div className="mt-4 pt-4 border-t border-carbon/10">
				<Link
					to="/hub/supply"
					className="text-xs text-hyper-green hover:underline flex items-center gap-1"
				>
					View Full List
					<span>→</span>
				</Link>
			</div>
		</div>
	);
}
