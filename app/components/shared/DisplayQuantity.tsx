import { useUnitDisplayMode } from "~/components/shell/UnitDisplayToggle";
import {
	type PresentQuantityInput,
	presentQuantity,
} from "~/lib/present-quantity";
import type { UnitDisplayMode } from "~/lib/unit-display-mode";

export interface DisplayQuantityProps {
	quantity: number;
	unit: string;
	baseQuantity?: number;
	baseUnit?: string;
	ingredientName?: string | null;
	mode?: UnitDisplayMode;
	className?: string;
	title?: string;
}

/** Renders a formatted quantity string respecting the global unit display mode. */
export function DisplayQuantity({
	quantity,
	unit,
	baseQuantity,
	baseUnit,
	ingredientName,
	mode: modeOverride,
	className,
	title,
}: DisplayQuantityProps) {
	const globalMode = useUnitDisplayMode();
	const mode = modeOverride ?? globalMode;
	const name = ingredientName ?? unit;

	const input: PresentQuantityInput = {
		quantity:
			mode === "original" || baseQuantity == null || baseUnit == null
				? quantity
				: baseQuantity,
		unit:
			mode === "original" || baseQuantity == null || baseUnit == null
				? unit
				: baseUnit,
		ingredientName: name,
		mode,
	};
	const result = presentQuantity(input);
	return (
		<span className={className} title={title ?? result.tooltip}>
			{result.formatted}
		</span>
	);
}

/** Hook returning a formatter bound to the current unit display mode. */
export function useQuantityFormatter(modeOverride?: UnitDisplayMode) {
	const globalMode = useUnitDisplayMode();
	const mode = modeOverride ?? globalMode;

	return (
		quantity: number,
		unit: string,
		ingredientName?: string | null,
		baseQuantity?: number,
		baseUnit?: string,
	) => {
		const name = ingredientName ?? unit;
		return presentQuantity({
			quantity:
				mode === "original" || baseQuantity == null || baseUnit == null
					? quantity
					: baseQuantity,
			unit:
				mode === "original" || baseQuantity == null || baseUnit == null
					? unit
					: baseUnit,
			ingredientName: name,
			mode,
		});
	};
}
