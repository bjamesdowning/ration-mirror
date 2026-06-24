interface SupplyShoppingBarProps {
	/** Progress counts — independent of hide-bought display filter */
	purchasedCount: number;
	totalCount: number;
}

export function SupplyShoppingBar({
	purchasedCount,
	totalCount,
}: SupplyShoppingBarProps) {
	const progress = totalCount > 0 ? (purchasedCount / totalCount) * 100 : 0;

	return (
		<div className="md:hidden sticky top-0 z-20 -mx-4 px-4 py-2.5 mb-3 glass-panel border-x-0 border-t-0 rounded-none space-y-2">
			<div className="flex items-center justify-between text-sm gap-2">
				<span className="text-muted font-medium">Shopping progress</span>
				<span className="text-data text-carbon dark:text-white font-semibold">
					{purchasedCount}/{totalCount} bought
				</span>
			</div>
			<div className="h-1.5 bg-platinum dark:bg-white/10 rounded-full overflow-hidden">
				<div
					className="h-full bg-hyper-green transition-all duration-300"
					style={{ width: `${progress}%` }}
				/>
			</div>
		</div>
	);
}
