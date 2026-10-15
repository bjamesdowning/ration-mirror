/**
 * Oven temperatures using the standard UK/Irish oven chart
 * (conventional °C, fan °C, °F, gas mark), e.g. 180°C = 160°C fan = 350°F = gas 4.
 * Cooking charts round °F to the nearest 25°F, so values come from this table
 * rather than the exact formula (180°C is 356°F exactly).
 */

export type OvenScale = "c" | "fan" | "f" | "gas";

export interface OvenRow {
	c: number;
	fan: number;
	f: number;
	gas: number;
	gasLabel: string;
}

export const OVEN_TABLE: OvenRow[] = [
	{ c: 110, fan: 90, f: 225, gas: 0.25, gasLabel: "1/4" },
	{ c: 120, fan: 100, f: 250, gas: 0.5, gasLabel: "1/2" },
	{ c: 140, fan: 120, f: 275, gas: 1, gasLabel: "1" },
	{ c: 150, fan: 130, f: 300, gas: 2, gasLabel: "2" },
	{ c: 170, fan: 150, f: 325, gas: 3, gasLabel: "3" },
	{ c: 180, fan: 160, f: 350, gas: 4, gasLabel: "4" },
	{ c: 190, fan: 170, f: 375, gas: 5, gasLabel: "5" },
	{ c: 200, fan: 180, f: 400, gas: 6, gasLabel: "6" },
	{ c: 220, fan: 200, f: 425, gas: 7, gasLabel: "7" },
	{ c: 230, fan: 210, f: 450, gas: 8, gasLabel: "8" },
	{ c: 240, fan: 220, f: 475, gas: 9, gasLabel: "9" },
];

export const OVEN_SCALE_LABELS: Record<OvenScale, string> = {
	c: "°C (conventional)",
	fan: "°C (fan oven)",
	f: "°F",
	gas: "Gas mark",
};

export interface OvenLookup {
	row: OvenRow;
	/** True when the input matched a chart row exactly. */
	exact: boolean;
}

/** Finds the chart row nearest to a temperature in the given scale. */
export function lookupOvenTemperature(
	value: number,
	scale: OvenScale,
): OvenLookup | null {
	if (!Number.isFinite(value)) return null;
	let best = OVEN_TABLE[0];
	let bestDiff = Number.POSITIVE_INFINITY;
	for (const row of OVEN_TABLE) {
		const diff = Math.abs(row[scale] - value);
		if (diff < bestDiff) {
			best = row;
			bestDiff = diff;
		}
	}
	const tolerance = scale === "gas" ? 0.5 : scale === "f" ? 25 : 15;
	if (bestDiff > tolerance) return null;
	return { row: best, exact: bestDiff === 0 };
}

/** Exact formula conversions, for temperatures outside the oven chart. */
export function celsiusToFahrenheit(c: number): number {
	return (c * 9) / 5 + 32;
}

export function fahrenheitToCelsius(f: number): number {
	return ((f - 32) * 5) / 9;
}
