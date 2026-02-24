import { ChefHatIcon, PackageIcon } from "~/components/icons/PageIcons";

interface AddTypeChoiceProps {
	/** Called when user selects Recipe (multi-ingredient meal) */
	onSelectRecipe: () => void;
	/** Called when user selects Provision (single item to buy or track) */
	onSelectItem: () => void;
}

/**
 * Choice step for Add flow: Recipe (meal) vs Provision (single item).
 * Shown after user taps Add; brief copy explains each option.
 */
export function AddTypeChoice({
	onSelectRecipe,
	onSelectItem,
}: AddTypeChoiceProps) {
	return (
		<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
			<button
				type="button"
				onClick={onSelectRecipe}
				className="flex flex-col items-start gap-2 p-5 rounded-xl border-2 border-carbon/10 dark:border-white/10 bg-ceramic dark:bg-white/5 hover:border-hyper-green hover:bg-hyper-green/5 transition-all text-left"
			>
				<ChefHatIcon className="w-8 h-8 text-hyper-green" />
				<span className="font-semibold text-carbon dark:text-white">
					Recipe
				</span>
				<span className="text-sm text-muted">
					Multi-ingredient meal with directions. Good for full dishes.
				</span>
			</button>
			<button
				type="button"
				onClick={onSelectItem}
				className="flex flex-col items-start gap-2 p-5 rounded-xl border-2 border-carbon/10 dark:border-white/10 bg-ceramic dark:bg-white/5 hover:border-hyper-green hover:bg-hyper-green/5 transition-all text-left"
			>
				<PackageIcon className="w-8 h-8 text-hyper-green" />
				<span className="font-semibold text-carbon dark:text-white">
					Provision
				</span>
				<span className="text-sm text-muted">
					Single thing to buy or track. Good for snacks, staples, household.
				</span>
			</button>
		</div>
	);
}
