import { useState } from "react";
import {
	celsiusToFahrenheit,
	fahrenheitToCelsius,
	lookupOvenTemperature,
	OVEN_SCALE_LABELS,
	OVEN_TABLE,
	type OvenScale,
} from "~/lib/oven-temperature";
import { parseQuantityInputLoose } from "~/lib/tool-input";

const SCALES: OvenScale[] = ["c", "fan", "f", "gas"];

export function OvenTemperatureConverter() {
	const [value, setValue] = useState("180");
	const [scale, setScale] = useState<OvenScale>("c");
	const parsed = parseQuantityInputLoose(value);
	const hit = parsed === null ? null : lookupOvenTemperature(parsed, scale);

	let exactNote: string | null = null;
	if (parsed !== null && (scale === "c" || scale === "f")) {
		exactNote =
			scale === "c"
				? `Exact: ${parsed}°C = ${Math.round(celsiusToFahrenheit(parsed))}°F`
				: `Exact: ${parsed}°F = ${Math.round(fahrenheitToCelsius(parsed))}°C`;
	}

	return (
		<section
			aria-labelledby="oven-temp"
			className="glass-panel rounded-2xl p-6 md:p-8"
		>
			<div className="w-6 h-[3px] bg-hyper-green rounded-full mb-4" />
			<h2 id="oven-temp" className="text-display text-lg text-carbon mb-1">
				Oven Temperature Converter
			</h2>
			<p className="text-sm text-muted mb-5 leading-relaxed">
				Convert between °C, fan oven, °F and gas mark using the standard oven
				chart. Fan ovens run about 20°C (25°F) lower than conventional.
			</p>
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<div>
					<label
						htmlFor="oven-value"
						className="text-label text-muted mb-1 block"
					>
						Temperature
					</label>
					<input
						id="oven-value"
						type="text"
						inputMode="decimal"
						autoComplete="off"
						value={value}
						onChange={(e) => setValue(e.target.value)}
						className="w-full bg-platinum rounded-lg px-4 py-3 text-carbon font-mono text-lg focus:ring-2 focus:ring-hyper-green/50 focus:outline-none"
					/>
				</div>
				<div>
					<label
						htmlFor="oven-scale"
						className="text-label text-muted mb-1 block"
					>
						Unit
					</label>
					<select
						id="oven-scale"
						value={scale}
						onChange={(e) => setScale(e.target.value as OvenScale)}
						className="w-full appearance-none rounded-lg bg-platinum px-4 py-3 text-carbon focus:ring-2 focus:ring-hyper-green/50 focus:outline-none"
					>
						{SCALES.map((s) => (
							<option key={s} value={s}>
								{OVEN_SCALE_LABELS[s]}
							</option>
						))}
					</select>
				</div>
			</div>
			<div
				aria-live="polite"
				className="mt-5 p-4 rounded-xl bg-hyper-green/10 border border-hyper-green/20 font-mono text-sm text-carbon"
			>
				{hit ? (
					<>
						<span className="font-bold text-hyper-green">
							{hit.exact ? "" : "≈ "}
							{hit.row.c}°C · {hit.row.fan}°C fan · {hit.row.f}°F · gas mark{" "}
							{hit.row.gasLabel}
						</span>
						{exactNote && !hit.exact && (
							<span className="block mt-1 text-muted">{exactNote}</span>
						)}
					</>
				) : parsed === null ? (
					<span className="text-muted">Enter a temperature, like 180.</span>
				) : (
					<span className="text-muted">
						Outside the usual oven range (gas mark 1/4 to 9).
						{exactNote ? ` ${exactNote}` : ""}
					</span>
				)}
			</div>
			<div className="mt-6 overflow-x-auto -mx-2 px-2">
				<table className="w-full text-sm font-mono">
					<caption className="sr-only">Oven temperature chart</caption>
					<thead>
						<tr className="border-b border-carbon/10">
							<th
								scope="col"
								className="text-left py-2 px-3 text-label text-muted first:pl-0"
							>
								°C
							</th>
							<th
								scope="col"
								className="text-left py-2 px-3 text-label text-muted"
							>
								Fan °C
							</th>
							<th
								scope="col"
								className="text-left py-2 px-3 text-label text-muted"
							>
								°F
							</th>
							<th
								scope="col"
								className="text-left py-2 px-3 text-label text-muted"
							>
								Gas mark
							</th>
						</tr>
					</thead>
					<tbody>
						{OVEN_TABLE.map((row) => (
							<tr
								key={row.c}
								className="border-b border-carbon/5 last:border-0"
							>
								<td className="py-2 px-3 first:pl-0">{row.c}</td>
								<td className="py-2 px-3">{row.fan}</td>
								<td className="py-2 px-3">{row.f}</td>
								<td className="py-2 px-3 text-hyper-green font-bold">
									{row.gasLabel}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</section>
	);
}
