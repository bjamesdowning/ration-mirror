import { useState } from "react";

interface PlateUpDialogProps {
	mealName: string;
	defaultServings?: number;
	onConfirm: (servings: number, logNutrition: boolean) => void;
	onClose: () => void;
}

/**
 * Small plate-up dialog before Manifest consume when nutrition-manifest is on.
 */
export function PlateUpDialog({
	mealName,
	defaultServings = 1,
	onConfirm,
	onClose,
}: PlateUpDialogProps) {
	const [servings, setServings] = useState(defaultServings);

	return (
		<div
			className="fixed inset-0 z-[75] flex items-end sm:items-center justify-center p-4 pb-24 sm:pb-4"
			role="dialog"
			aria-modal="true"
			aria-label="Log servings"
		>
			<button
				type="button"
				className="absolute inset-0 bg-carbon/60 backdrop-blur-sm"
				onClick={onClose}
				aria-label="Close"
			/>

			<div className="relative z-10 w-full max-w-sm bg-ceramic border border-platinum rounded-2xl shadow-glow p-5 space-y-5">
				<div>
					<p className="text-[10px] font-mono font-semibold uppercase tracking-widest text-muted">
						Plate-up
					</p>
					<h2 className="text-base font-bold text-carbon font-mono capitalize mt-0.5">
						{mealName}
					</h2>
					<p className="text-sm text-muted mt-2">
						How many servings did you eat? This updates your day totals when
						nutrition logging is on.
					</p>
				</div>

				<label className="block space-y-2">
					<span className="text-xs font-mono text-muted uppercase tracking-wide">
						Servings
					</span>
					<input
						type="number"
						min={0.5}
						max={100}
						step={0.5}
						value={servings}
						onChange={(e) => {
							const next = Number(e.target.value);
							if (Number.isFinite(next)) setServings(next);
						}}
						className="w-full px-3 py-2.5 text-sm bg-transparent border border-platinum rounded-lg text-carbon font-mono focus:outline-none focus:border-hyper-green focus:ring-1 focus:ring-hyper-green"
					/>
				</label>

				<div className="flex flex-col gap-2">
					<button
						type="button"
						onClick={() => onConfirm(servings, true)}
						disabled={!Number.isFinite(servings) || servings <= 0}
						className="w-full px-4 py-2.5 text-sm font-semibold rounded-lg bg-hyper-green text-on-hyper-green hover:shadow-glow disabled:opacity-40 disabled:cursor-not-allowed transition-all"
					>
						Consume &amp; log
					</button>
					<button
						type="button"
						onClick={() => onConfirm(servings > 0 ? servings : 1, false)}
						className="w-full px-4 py-2.5 text-sm font-medium rounded-lg border border-platinum text-muted hover:text-carbon hover:bg-platinum/40 transition-colors"
					>
						Skip calorie log
					</button>
					<button
						type="button"
						onClick={onClose}
						className="w-full px-4 py-2 text-sm text-muted hover:text-carbon transition-colors"
					>
						Cancel
					</button>
				</div>
			</div>
		</div>
	);
}
