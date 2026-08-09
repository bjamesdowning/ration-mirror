import { useState } from "react";
import {
	applyUserOverrideToSnapshot,
	blankCargoNutritionSnapshot,
	formatCoveragePercent,
	getDisplayNutrients,
	isMealNutritionSnapshot,
	kcalToKj,
	provenanceLabel,
} from "~/lib/nutrition/panel-helpers";
import type {
	MealNutritionSnapshot,
	NutritionSnapshot,
} from "~/lib/nutrition/types";

export type NutritionPanelProps = {
	nutrition: MealNutritionSnapshot | NutritionSnapshot | null;
	mode: "meal" | "cargo";
	editable?: boolean;
	onChange?: (snap: NutritionSnapshot) => void;
	showAttribution?: boolean;
};

function formatNum(n: number | null | undefined, digits = 1): string {
	if (n == null || !Number.isFinite(n)) return "—";
	return Number.isInteger(n) ? String(n) : n.toFixed(digits);
}

function ProvenanceChip({
	label,
}: {
	label: ReturnType<typeof provenanceLabel>;
}) {
	const styles: Record<typeof label, string> = {
		USDA: "bg-hyper-green/15 text-hyper-green border-hyper-green/40",
		Estimated: "bg-platinum text-carbon border-platinum",
		Override: "bg-carbon/10 text-carbon border-carbon/20",
		Blank: "bg-platinum/50 text-muted border-platinum",
	};
	return (
		<span
			className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${styles[label]}`}
		>
			{label}
		</span>
	);
}

export function NutritionPanel({
	nutrition,
	mode,
	editable = false,
	onChange,
	showAttribution = true,
}: NutritionPanelProps) {
	const [attributionOpen, setAttributionOpen] = useState(false);
	const values = getDisplayNutrients(nutrition, mode);
	const source =
		nutrition && !isMealNutritionSnapshot(nutrition)
			? nutrition.source
			: nutrition && isMealNutritionSnapshot(nutrition)
				? (nutrition.attributions[0]?.source ?? null)
				: null;
	const label = provenanceLabel(source, values != null);
	const mealSnap =
		nutrition && isMealNutritionSnapshot(nutrition) ? nutrition : null;
	const energyKcal = values?.energyKcal ?? null;
	const energyKj =
		energyKcal != null && Number.isFinite(energyKcal)
			? kcalToKj(energyKcal)
			: null;

	const handleMacroChange = (
		field: "energyKcal" | "proteinG" | "fatG" | "carbG",
		raw: string,
	) => {
		if (!onChange) return;
		const parsed = Number(raw);
		if (!Number.isFinite(parsed)) return;
		const prev =
			nutrition && !isMealNutritionSnapshot(nutrition)
				? nutrition
				: blankCargoNutritionSnapshot();
		onChange(applyUserOverrideToSnapshot(prev, { [field]: parsed }));
	};

	const inputClass =
		"w-full bg-platinum rounded-lg px-2 py-1.5 text-sm text-carbon text-data focus:ring-2 focus:ring-hyper-green/50 focus:outline-none";

	const blankPerServing = blankCargoNutritionSnapshot().perServing;
	const displayValues =
		values ?? (editable && onChange ? blankPerServing : null);

	return (
		<section
			className="rounded-xl border border-platinum/70 bg-ceramic p-4 space-y-3"
			aria-label="Nutrition"
		>
			<div className="flex flex-wrap items-center justify-between gap-2">
				<h3 className="text-label text-muted text-xs uppercase tracking-wide flex items-center gap-2">
					<span className="w-2 h-2 rounded-full bg-hyper-green" />
					Nutrition
					{mode === "meal" ? " · per serving" : ""}
				</h3>
				<div className="flex items-center gap-2">
					{mealSnap != null && (
						<span
							className="text-xs px-2 py-0.5 rounded-md bg-platinum text-carbon border border-platinum"
							title="Matched ingredient mass coverage"
						>
							Coverage {formatCoveragePercent(mealSnap.coverage)}
						</span>
					)}
					<ProvenanceChip label={label} />
				</div>
			</div>

			{!displayValues ? (
				<p className="text-sm text-muted">No nutrition matched</p>
			) : (
				<table className="w-full text-sm">
					<thead>
						<tr className="text-left text-xs text-muted">
							<th scope="col" className="pb-2 font-medium">
								Nutrient
							</th>
							<th scope="col" className="pb-2 font-medium text-right">
								Amount
							</th>
						</tr>
					</thead>
					<tbody className="text-carbon">
						<tr className="border-t border-platinum/60">
							<th scope="row" className="py-2 font-medium text-left">
								Energy
							</th>
							<td className="py-2 text-right text-data">
								{editable && onChange ? (
									<div className="flex items-center justify-end gap-1">
										<input
											type="number"
											inputMode="decimal"
											step="any"
											min={0}
											aria-label="Energy kcal"
											className={`${inputClass} max-w-[6rem]`}
											value={displayValues.energyKcal}
											onChange={(e) =>
												handleMacroChange("energyKcal", e.target.value)
											}
										/>
										<span className="text-xs text-muted">kcal</span>
									</div>
								) : (
									<>
										{formatNum(energyKcal, 0)} kcal
										{energyKj != null && (
											<span className="text-muted text-xs ml-1">
												({formatNum(energyKj, 0)} kJ)
											</span>
										)}
									</>
								)}
							</td>
						</tr>
						{(
							[
								["Protein", "proteinG", "g"],
								["Fat", "fatG", "g"],
								["Carbohydrate", "carbG", "g"],
							] as const
						).map(([rowLabel, key, unit]) => (
							<tr key={key} className="border-t border-platinum/60">
								<th scope="row" className="py-2 font-medium text-left">
									{rowLabel}
								</th>
								<td className="py-2 text-right text-data">
									{editable && onChange ? (
										<div className="flex items-center justify-end gap-1">
											<input
												type="number"
												inputMode="decimal"
												step="any"
												min={0}
												aria-label={rowLabel}
												className={`${inputClass} max-w-[6rem]`}
												value={displayValues[key]}
												onChange={(e) => handleMacroChange(key, e.target.value)}
											/>
											<span className="text-xs text-muted">{unit}</span>
										</div>
									) : (
										`${formatNum(displayValues[key])} ${unit}`
									)}
								</td>
							</tr>
						))}
						{(
							[
								["Fiber", displayValues.fiberG],
								["Sugars", displayValues.sugarG],
								["Saturated fat", displayValues.satFatG],
								["Salt", displayValues.saltG],
							] as const
						).map(([rowLabel, amount]) =>
							amount != null ? (
								<tr key={rowLabel} className="border-t border-platinum/40">
									<th
										scope="row"
										className="py-1.5 font-normal text-left text-muted"
									>
										{rowLabel}
									</th>
									<td className="py-1.5 text-right text-data text-muted">
										{formatNum(amount)} g
									</td>
								</tr>
							) : null,
						)}
					</tbody>
				</table>
			)}

			{showAttribution &&
				mealSnap &&
				mealSnap.attributions.length > 0 &&
				!editable && (
					<div className="pt-1 border-t border-platinum/60">
						<button
							type="button"
							onClick={() => setAttributionOpen((o) => !o)}
							className="text-xs text-hyper-green hover:underline"
							aria-expanded={attributionOpen}
						>
							{attributionOpen ? "Hide" : "Show"} ingredient attribution (
							{mealSnap.attributions.length})
						</button>
						{attributionOpen && (
							<ul className="mt-2 space-y-1.5 text-xs text-muted">
								{mealSnap.attributions.map((a) => (
									<li
										key={`${a.ingredientIndex}-${a.ingredientName}`}
										className="flex justify-between gap-2 border-b border-platinum/40 pb-1 last:border-0"
									>
										<span className="text-carbon truncate">
											{a.ingredientName}
											<span className="text-muted ml-1">
												({provenanceLabel(a.source, true)})
											</span>
										</span>
										<span className="text-data shrink-0">
											{formatNum(a.contribution.energyKcal, 0)} kcal
										</span>
									</li>
								))}
							</ul>
						)}
					</div>
				)}
		</section>
	);
}
