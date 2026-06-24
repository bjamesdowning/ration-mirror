import { FilterChip } from "~/components/shell/FilterSheet";
import { DOMAIN_ICONS, DOMAIN_LABELS, ITEM_DOMAINS } from "~/lib/domain";
import type { SupplySortMode } from "~/lib/supply-sort";

type ItemDomain = (typeof ITEM_DOMAINS)[number];

const SORT_OPTIONS: { id: SupplySortMode; label: string }[] = [
	{ id: "alpha", label: "A–Z" },
	{ id: "unpurchased", label: "Unbought first" },
	{ id: "added", label: "Added order" },
];

interface SupplyShoppingBarProps {
	/** Progress counts — independent of hide-bought display filter */
	purchasedCount: number;
	totalCount: number;
	remainingCount: number;
	hidePurchased: boolean;
	activeDomain: ItemDomain | "all";
	sortMode: SupplySortMode;
	onDomainChange: (domain: ItemDomain | "all") => void;
	onSortChange: (sort: SupplySortMode) => void;
	onHidePurchasedChange: (hide: boolean) => void;
}

export function SupplyShoppingBar({
	purchasedCount,
	totalCount,
	remainingCount,
	hidePurchased,
	activeDomain,
	sortMode,
	onDomainChange,
	onSortChange,
	onHidePurchasedChange,
}: SupplyShoppingBarProps) {
	const progress = totalCount > 0 ? (purchasedCount / totalCount) * 100 : 0;

	return (
		<div className="md:hidden sticky top-0 z-20 -mx-4 px-4 py-3 mb-4 bg-ceramic/95 dark:bg-carbon/95 backdrop-blur-sm border-b border-platinum dark:border-white/10 space-y-3">
			<div>
				<div className="flex items-center justify-between text-sm mb-1.5 gap-2">
					<span className="text-muted font-medium">Shopping progress</span>
					<span className="text-data text-carbon dark:text-white font-semibold text-right">
						{purchasedCount}/{totalCount} bought
						{hidePurchased && remainingCount > 0 && (
							<span className="text-muted font-normal">
								{" "}
								· {remainingCount} left
							</span>
						)}
					</span>
				</div>
				<div className="h-2 bg-platinum dark:bg-white/10 rounded-full overflow-hidden">
					<div
						className="h-full bg-hyper-green transition-all duration-300"
						style={{ width: `${progress}%` }}
					/>
				</div>
			</div>

			<div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
				<FilterChip
					label="All"
					isActive={activeDomain === "all"}
					onClick={() => onDomainChange("all")}
				/>
				{ITEM_DOMAINS.map((domain) => {
					const Icon = DOMAIN_ICONS[domain];
					return (
						<FilterChip
							key={domain}
							label={DOMAIN_LABELS[domain]}
							icon={<Icon className="w-4 h-4" />}
							isActive={activeDomain === domain}
							onClick={() => onDomainChange(domain)}
						/>
					);
				})}
			</div>

			<div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
				{SORT_OPTIONS.map((opt) => (
					<FilterChip
						key={opt.id}
						label={opt.label}
						isActive={sortMode === opt.id}
						onClick={() => onSortChange(opt.id)}
					/>
				))}
				<FilterChip
					label={hidePurchased ? "Showing unbought" : "Hide bought"}
					isActive={hidePurchased}
					onClick={() => onHidePurchasedChange(!hidePurchased)}
				/>
			</div>
		</div>
	);
}
