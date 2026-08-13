import {
	amountFromServings,
	canLogIntakeByMass,
	INTAKE_PORTION_PRESETS,
	INTAKE_SERVINGS_MAX,
	INTAKE_SERVINGS_MIN,
	type IntakeLoggedUnit,
	intakeAmountStep,
	resolveIntakeAmount,
	roundLoggedAmount,
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

function applyAmount(
	amount: number,
	unit: IntakeLoggedUnit,
	gramsPerServing: number | null,
	fallback: IntakeAmountValue,
): IntakeAmountValue {
	const resolved = resolveIntakeAmount({ amount, unit }, { gramsPerServing });
	if (!resolved.ok) return fallback;
	return {
		servings: resolved.servings,
		amount: resolved.loggedAmount,
		unit: resolved.loggedUnit,
	};
}

/**
 * Eat amount: fraction chips, free numeric field, optional servings|g|oz.
 */
export function IntakeAmountField({
	value,
	gramsPerServing,
	massUnit,
	disabled = false,
	onChange,
}: IntakeAmountFieldProps) {
	const massEnabled = canLogIntakeByMass(gramsPerServing);
	const step = intakeAmountStep(value.unit);
	const servingHint =
		massEnabled && gramsPerServing != null
			? `1 serving ≈ ${Math.round(gramsPerServing)} g from recipe ingredients`
			: null;

	const setUnit = (unit: IntakeLoggedUnit) => {
		if (unit === value.unit) return;
		const converted = amountFromServings(value.servings, unit, gramsPerServing);
		if (converted == null) {
			onChange({
				servings: value.servings,
				amount: value.servings,
				unit: "serving",
			});
			return;
		}
		onChange(applyAmount(converted, unit, gramsPerServing, value));
	};

	const nudge = (direction: 1 | -1) => {
		const nextAmount = roundLoggedAmount(
			value.amount + direction * step,
			value.unit,
		);
		onChange(applyAmount(nextAmount, value.unit, gramsPerServing, value));
	};

	return (
		<fieldset className="space-y-3 m-0 min-w-0 border-0 p-0">
			<legend className="text-xs font-mono text-muted uppercase tracking-wide">
				How much did you eat?
			</legend>
			<div className="flex flex-wrap gap-1.5">
				{INTAKE_PORTION_PRESETS.map((preset) => {
					const selected =
						value.unit === "serving" &&
						Math.abs(value.servings - preset.value) < 0.005;
					return (
						<button
							key={preset.label}
							type="button"
							disabled={disabled}
							aria-pressed={selected}
							onClick={() =>
								onChange(
									applyAmount(preset.value, "serving", gramsPerServing, value),
								)
							}
							className={`px-2.5 py-1.5 text-xs font-mono rounded-lg border transition-colors disabled:opacity-40 ${
								selected
									? "border-hyper-green bg-hyper-green/10 text-carbon"
									: "border-platinum text-muted hover:border-hyper-green/50 hover:text-carbon"
							}`}
						>
							{preset.label}
						</button>
					);
				})}
			</div>
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
					value={value.amount}
					onChange={(e) => {
						const next = Number(e.target.value);
						if (!Number.isFinite(next)) return;
						onChange(applyAmount(next, value.unit, gramsPerServing, value));
					}}
					className="flex-1 min-w-0 px-3 py-2.5 text-sm bg-transparent border border-platinum rounded-lg text-carbon font-mono focus:outline-none focus:border-hyper-green focus:ring-1 focus:ring-hyper-green"
					aria-label="Amount eaten"
				/>
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
