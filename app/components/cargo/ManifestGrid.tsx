import { CargoCard } from "~/components/cargo/CargoCard";
import type { cargo } from "~/db/schema";

interface ManifestGridProps {
	items: (typeof cargo.$inferSelect)[];
	promotedCargoIds?: string[];
	onUpgradeRequired?: () => void;
}

export function ManifestGrid({
	items,
	promotedCargoIds,
	onUpgradeRequired,
}: ManifestGridProps) {
	if (items.length === 0) {
		return (
			<div className="p-8 bg-platinum/30 rounded-2xl text-center">
				<p className="text-muted text-lg">Cargo Hold Empty</p>
				<p className="text-sm text-muted/70 mt-2">Add items to get started</p>
			</div>
		);
	}

	return (
		<div className="p-4 bg-platinum/30 rounded-2xl">
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
				{items.map((item) => (
					<CargoCard
						key={item.id}
						item={item}
						isPromoted={promotedCargoIds?.includes(item.id) ?? false}
						onUpgradeRequired={onUpgradeRequired}
					/>
				))}
			</div>
		</div>
	);
}
