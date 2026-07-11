import { useEffect, useRef, useState } from "react";
import { useFetcher, useRevalidator } from "react-router";
import { getDayName, SUPPLY_MANIFEST_HORIZON } from "~/lib/manifest-dates";

export const SUPPLY_HORIZON_PRESETS = [7, 14, 21, 30] as const;

interface SupplyHorizonPickerProps {
	horizonDays: number;
	windowEndDate: string;
	canEdit: boolean;
	onHorizonChange?: (days: number) => void;
	/** Stretch preset chips to fill container width. */
	fullWidth?: boolean;
	/** Show numeric stepper for fine control (desktop). */
	showStepper?: boolean;
}

function formatWindowSummary(horizonDays: number, endDate: string): string {
	const dayLabel = getDayName(endDate, true);
	const [, month, day] = endDate.split("-");
	const monthNames = [
		"Jan",
		"Feb",
		"Mar",
		"Apr",
		"May",
		"Jun",
		"Jul",
		"Aug",
		"Sep",
		"Oct",
		"Nov",
		"Dec",
	];
	const monthLabel = monthNames[Number(month) - 1] ?? month;
	return `Including Manifest meals through ${dayLabel}, ${monthLabel} ${Number(day)} (${horizonDays} day${horizonDays === 1 ? "" : "s"})`;
}

export function SupplyHorizonPicker({
	horizonDays,
	windowEndDate,
	canEdit,
	onHorizonChange,
	fullWidth = false,
	showStepper = false,
}: SupplyHorizonPickerProps) {
	const revalidator = useRevalidator();
	const fetcher = useFetcher<{
		supplySettings?: { manifestHorizonDays?: number };
		window?: { endDate: string; horizonDays: number };
	}>();
	const pendingDaysRef = useRef<number | null>(null);
	const [displayHorizon, setDisplayHorizon] = useState(horizonDays);
	const [sliderDraft, setSliderDraft] = useState(horizonDays);
	const [displayEndDate, setDisplayEndDate] = useState(windowEndDate);

	useEffect(() => {
		setDisplayHorizon(horizonDays);
		setSliderDraft(horizonDays);
		setDisplayEndDate(windowEndDate);
	}, [horizonDays, windowEndDate]);

	const submitHorizon = (days: number) => {
		if (!canEdit || days === displayHorizon) return;
		pendingDaysRef.current = days;
		setDisplayHorizon(days);
		setSliderDraft(days);
		fetcher.submit(JSON.stringify({ manifestHorizonDays: days }), {
			method: "PATCH",
			action: "/api/organization/supply-settings",
			encType: "application/json",
		});
	};

	useEffect(() => {
		if (fetcher.state !== "idle") return;
		if (pendingDaysRef.current !== null && fetcher.data?.supplySettings) {
			const savedDays =
				fetcher.data.supplySettings.manifestHorizonDays ??
				pendingDaysRef.current;
			setDisplayHorizon(savedDays);
			setSliderDraft(savedDays);
			if (fetcher.data.window?.endDate) {
				setDisplayEndDate(fetcher.data.window.endDate);
			}
			revalidator.revalidate();
			onHorizonChange?.(savedDays);
			pendingDaysRef.current = null;
		}
	}, [fetcher.state, fetcher.data, onHorizonChange, revalidator]);

	return (
		<div className="space-y-3">
			<p className="text-xs text-muted">
				{formatWindowSummary(displayHorizon, displayEndDate)}
			</p>
			{canEdit ? (
				<>
					<fieldset
						className={`flex items-center rounded-lg overflow-hidden border border-platinum dark:border-white/10 m-0 p-0 ${
							fullWidth ? "w-full" : ""
						}`}
						aria-label="Supply planning horizon"
					>
						<legend className="sr-only">
							Days of Manifest meals to include in Supply
						</legend>
						{SUPPLY_HORIZON_PRESETS.map((days) => (
							<button
								key={days}
								type="button"
								onClick={() => submitHorizon(days)}
								disabled={fetcher.state !== "idle"}
								aria-pressed={displayHorizon === days}
								className={`${fullWidth ? "flex-1" : ""} px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
									displayHorizon === days
										? "bg-hyper-green text-carbon"
										: "text-muted hover:bg-platinum/50 dark:hover:bg-white/10"
								}`}
							>
								{days}d
							</button>
						))}
					</fieldset>
					{showStepper && (
						<div className="flex items-center gap-3">
							<label
								htmlFor="supply-horizon-stepper"
								className="text-sm text-muted"
							>
								Custom days
							</label>
							<input
								id="supply-horizon-stepper"
								type="range"
								min={SUPPLY_MANIFEST_HORIZON.min}
								max={SUPPLY_MANIFEST_HORIZON.max}
								value={sliderDraft}
								disabled={fetcher.state !== "idle"}
								onChange={(e) => setSliderDraft(Number(e.target.value))}
								onPointerUp={() => submitHorizon(sliderDraft)}
								onKeyUp={(e) => {
									if (e.key === "Enter") submitHorizon(sliderDraft);
								}}
								className="flex-1 accent-hyper-green"
							/>
							<span className="text-sm font-mono text-carbon dark:text-ceramic min-w-[2ch]">
								{sliderDraft}
							</span>
						</div>
					)}
					{fetcher.state !== "idle" && (
						<span className="text-hyper-green animate-pulse text-sm">
							Saving...
						</span>
					)}
				</>
			) : (
				<p className="text-xs text-muted">
					Ask a group owner or admin to change the planning horizon.
				</p>
			)}
		</div>
	);
}
