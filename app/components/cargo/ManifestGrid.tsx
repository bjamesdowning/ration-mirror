import { CargoCard } from "~/components/cargo/CargoCard";
import { CargoListRow } from "~/components/cargo/CargoListRow";
import type { cargo } from "~/db/schema";

type ViewMode = "card" | "list";

interface ManifestGridProps {
	items: (typeof cargo.$inferSelect)[];
	promotedCargoIds?: string[];
	onUpgradeRequired?: () => void;
	viewMode?: ViewMode;
	getDetailHref?: (item: typeof cargo.$inferSelect) => string;
}

export function ManifestGrid({
	items,
	promotedCargoIds,
	onUpgradeRequired,
	viewMode = "card",
	getDetailHref,
}: ManifestGridProps) {
	if (items.length === 0) {
		return (
			<div className="p-8 bg-platinum/30 rounded-2xl text-center">
				<p className="text-muted text-lg">Cargo Hold Empty</p>
				<p className="text-sm text-muted/70 mt-2">Add items to get started</p>
			</div>
		);
	}

	if (viewMode === "list") {
		return (
			<div className="bg-platinum/30 rounded-2xl px-4 py-2 pb-36 md:pb-2 divide-y divide-platinum/50 overflow-hidden">
				{items.map((item) => (
					<CargoListRow
						key={item.id}
						item={item}
						isPromoted={promotedCargoIds?.includes(item.id) ?? false}
						onUpgradeRequired={onUpgradeRequired}
						detailHref={getDetailHref?.(item)}
					/>
				))}
			</div>
		);
	}

	return (
		<div className="p-4 bg-platinum/30 rounded-2xl overflow-hidden">
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
				{items.map((item) => (
					<CargoCard
						key={item.id}
						item={item}
						isPromoted={promotedCargoIds?.includes(item.id) ?? false}
						onUpgradeRequired={onUpgradeRequired}
						detailHref={getDetailHref?.(item)}
					/>
				))}
			</div>
		</div>
	);
}
