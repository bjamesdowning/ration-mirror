import { InventoryCard } from "~/components/cargo/InventoryCard";
import type { inventory } from "~/db/schema";

interface ManifestGridProps {
	items: (typeof inventory.$inferSelect)[];
}

export function ManifestGrid({ items }: ManifestGridProps) {
	if (items.length === 0) {
		return (
			<div className="p-8 border border-dashed border-[#39FF14]/30 text-center text-[#39FF14]/50 font-mono uppercase">
				<p>Cargo Hold Empty</p>
				<p className="text-sm mt-2">Initiate Ingest Sequence</p>
			</div>
		);
	}

	return (
		<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
			{items.map((item) => (
				<InventoryCard key={item.id} item={item} />
			))}
		</div>
	);
}
