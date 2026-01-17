// @ts-nocheck

import { useFetcher } from "react-router";
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

function InventoryCard({ item }: { item: typeof inventory.$inferSelect }) {
	const fetcher = useFetcher();
	const isDeleting =
		fetcher.state !== "idle" && fetcher.formData?.get("intent") === "delete";

	// Mock integrity based on expiresAt
	const daysUntilExpiry = item.expiresAt
		? Math.ceil(
				(new Date(item.expiresAt).getTime() - Date.now()) /
					(1000 * 60 * 60 * 24),
			)
		: 100;

	const integrity = Math.max(0, Math.min(100, daysUntilExpiry));

	let integrityColor = "bg-[#39FF14]";
	if (integrity < 3) integrityColor = "bg-red-500";
	else if (integrity < 7) integrityColor = "bg-yellow-500";

	// Hide if deleting (Optimistic UI)
	if (isDeleting) {
		return null;
	}

	return (
		<div className="relative group p-4 border border-[#39FF14] bg-[#051105]/90 font-mono text-[#39FF14] hover:bg-[#0a220a] transition-colors">
			{/* Header: Name & Qty */}
			<div className="flex justify-between items-start mb-2">
				<h3
					className="text-lg font-bold uppercase tracking-wider truncate mr-2"
					title={item.name}
				>
					{item.name}
				</h3>
				<div className="text-right">
					<span className="text-xl font-bold">{item.quantity}</span>
					<span className="text-xs ml-1 opacity-70">{item.unit}</span>
				</div>
			</div>

			{/* Tags */}
			<div className="flex flex-wrap gap-2 mb-4">
				{/* Safe parsing of tags if it comes as string (DB) vs object (Schema) */}
				{(typeof item.tags === "string"
					? JSON.parse(item.tags)
					: item.tags
				).map((tag: string) => (
					<span
						key={tag}
						className="text-[10px] px-1 py-0.5 border border-[#39FF14]/50 opacity-80 uppercase"
					>
						{tag}
					</span>
				))}
			</div>

			{/* Footer: Integrity & Actions */}
			<div className="mt-auto relative">
				<div className="flex justify-between text-[10px] uppercase opacity-70 mb-1">
					<span>Integrity</span>
					<span>
						{item.expiresAt
							? new Date(item.expiresAt).toLocaleDateString()
							: "STABLE"}
					</span>
				</div>
				<div className="h-1 w-full bg-[#39FF14]/20">
					<div
						className={`h-full ${integrityColor} transition-all duration-500`}
						style={{
							width: `${item.expiresAt ? Math.min(100, Math.max(0, (daysUntilExpiry / 30) * 100)) : 100}%`,
						}}
					/>
				</div>

				{/* Delete Action */}
				<div className="absolute -top-12 right-0 opacity-0 group-hover:opacity-100 transition-opacity">
					<fetcher.Form method="post">
						<input type="hidden" name="intent" value="delete" />
						<input type="hidden" name="itemId" value={item.id} />
						<button
							type="submit"
							className="text-red-500 hover:text-red-400 bg-black/90 px-2 py-1 text-xs border border-red-500 shadow-[0_0_10px_rgba(255,0,0,0.3)] uppercase font-bold tracking-wider"
						>
							[JETTISON]
						</button>
					</fetcher.Form>
				</div>
			</div>
		</div>
	);
}
