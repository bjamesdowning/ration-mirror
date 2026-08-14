import { useState } from "react";
import {
	amountFromServings,
	canLogIntakeByMass,
	clampedIntakeResolve,
	clampedIntakeStep,
	INTAKE_SERVINGS_MAX,
	INTAKE_SERVINGS_MIN,
	type IntakeLoggedUnit,
} from "~/lib/nutrition/intake-amount";

export type IntakeAmountValue = {
	servings: number;
	amount: number;
	unit: IntakeLoggedUnit;
};

type IntakeAmountFieldProps = {
	value: IntakeAmountValue;
	gramsPerServing: number | null;
	massUnit: "g" | "oz";
	disabled?: boolean;
	onChange: (next: IntakeAmountValue) => void;
};

/**
 * Eat amount: decimal field as primary control, −/+ nudge, optional servings|g|oz.
 */
export function IntakeAmountField({
	value,
	gramsPerServing,
	massUnit,
	disabled = false,
	onChange,
}: IntakeAmountFieldProps) {
	const massEnabled = canLogIntakeByMass(gramsPerServing);
	const servingHint =
		massEnabled && gramsPerServing != null
			? `1 serving ≈ ${Math.round(gramsPerServing)} g from recipe ingredients`
			: null;
	const unitLabel = value.unit === "serving" ? "servings" : value.unit;
	const [draft, setDraft] = useState<string | null>(null);

	const commitAmount = (raw: string) => {
		const next = Number(raw);
		onChange(
			clampedIntakeResolve(
				Number.isFinite(next) ? next : value.amount,
				value.unit,
				gramsPerServing,
			),
		);
	};

	const setUnit = (unit: IntakeLoggedUnit) => {
		if (unit === value.unit) return;
		setDraft(null);
		const converted = amountFromServings(value.servings, unit, gramsPerServing);
		if (converted == null) {
			onChange({
				servings: value.servings,
				amount: value.servings,
				unit: "serving",
			});
			return;
		}
		onChange(clampedIntakeResolve(converted, unit, gramsPerServing));
	};

	const nudge = (direction: 1 | -1) => {
		setDraft(null);
		onChange(
			clampedIntakeStep(value.amount, value.unit, direction, gramsPerServing),
		);
	};

	return (
		<fieldset className="space-y-3 m-0 min-w-0 border-0 p-0">
			<legend className="text-xs font-mono text-muted uppercase tracking-wide">
				How much did you eat?
			</legend>
			<div className="flex items-stretch gap-2">
				<button
					type="button"
					disabled={disabled}
					aria-label="Decrease amount"
					onClick={() => nudge(-1)}
					className="px-3 rounded-lg border border-platinum text-carbon font-mono text-lg hover:border-hyper-green disabled:opacity-40"
				>
					−
				</button>
				<input
					type="number"
					min={value.unit === "serving" ? INTAKE_SERVINGS_MIN : 0.1}
					max={
						value.unit === "serving"
							? INTAKE_SERVINGS_MAX
							: INTAKE_SERVINGS_MAX * (gramsPerServing ?? 1)
					}
					step="any"
					inputMode="decimal"
					disabled={disabled}
					value={draft ?? String(value.amount)}
					onChange={(e) => {
						const raw = e.target.value;
						setDraft(raw);
						const next = Number(raw);
						if (!Number.isFinite(next) || next <= 0) return;
						onChange(clampedIntakeResolve(next, value.unit, gramsPerServing));
					}}
					onBlur={() => {
						commitAmount(draft ?? String(value.amount));
						setDraft(null);
					}}
					className="flex-1 min-w-0 px-3 py-2.5 text-sm bg-transparent border border-platinum rounded-lg text-carbon font-mono focus:outline-none focus:border-hyper-green focus:ring-1 focus:ring-hyper-green"
					aria-label="Amount eaten"
				/>
				<span className="self-center text-[10px] font-mono uppercase tracking-wide text-muted shrink-0">
					{unitLabel}
				</span>
				<button
					type="button"
					disabled={disabled}
					aria-label="Increase amount"
					onClick={() => nudge(1)}
					className="px-3 rounded-lg border border-platinum text-carbon font-mono text-lg hover:border-hyper-green disabled:opacity-40"
				>
					+
				</button>
			</div>
			{massEnabled ? (
				<fieldset className="m-0 flex min-w-0 gap-1 border-0 p-0">
					<legend className="sr-only">Amount unit</legend>
					{(["serving", massUnit] as const).map((unit) => {
						const selected = value.unit === unit;
						const label = unit === "serving" ? "Servings" : unit;
						return (
							<button
								key={unit}
								type="button"
								disabled={disabled}
								aria-pressed={selected}
								onClick={() => setUnit(unit)}
								className={`flex-1 px-2 py-1.5 text-[10px] font-mono uppercase tracking-wide rounded-lg border transition-colors disabled:opacity-40 ${
									selected
										? "border-hyper-green bg-hyper-green/10 text-carbon"
										: "border-platinum text-muted hover:border-hyper-green/50"
								}`}
							>
								{label}
							</button>
						);
					})}
				</fieldset>
			) : null}
			{servingHint ? (
				<p className="text-[10px] text-muted">{servingHint}</p>
			) : null}
		</fieldset>
	);
}
