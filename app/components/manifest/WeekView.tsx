import { Link } from "react-router";
import type { AllergenSlug } from "~/lib/allergens";
import type { MealPlanEntryWithMeal } from "~/lib/manifest.server";
import { getDayName } from "~/lib/manifest-dates";
import {
	type DayNutrientTotals,
	emptyDayNutrientTotals,
	formatGoalProgressStrip,
	hasAnyGoalTarget,
	selectGoalProgressLines,
	type UserGoalTargets,
} from "~/lib/nutrition/day-totals";
import type { SlotType } from "~/lib/schemas/manifest";
import { SLOT_TYPES } from "~/lib/schemas/manifest";
import { ManifestDaySupplyToggle } from "./ManifestDaySupplyToggle";
import { MealSlot } from "./MealSlot";

interface WeekViewProps {
	dates: string[];
	entries: MealPlanEntryWithMeal[];
	planId: string;
	onAdd: (slot: SlotType, date: string) => void;
	/** legacy: existing Eat/consume flow. split: Cook/Log-split (nutrition-cook-log-split). */
	mode?: "legacy" | "split";
	onConsume?: (entryId: string) => void;
	onCopy?: (entry: MealPlanEntryWithMeal) => void;
	onCopyDay?: (date: string) => void;
	isConsuming?: boolean;
	today: string;
	showSnackSlot?: boolean;
	readOnly?: boolean;
	selectedDate?: string;
	onSelectDate?: (date: string) => void;
	triggeredAllergensByMealId?: Record<string, AllergenSlug[]>;
	readyMealIds?: Record<string, boolean>;
	supplyDayInclusion?: Record<string, boolean>;
	onToggleSupplyInclusion?: (date: string) => void;
	togglingSupplyDate?: string | null;
	/** Both nutrition-manifest + nutrition-goals client flags on. */
	goalsChrome?: boolean;
	goalTargets?: UserGoalTargets | null;
	/** Per-date consumed nutrients when goals chrome is on. */
	dayConsumedNutrients?: Record<string, DayNutrientTotals>;
	/** split mode — label for the Cook button (e.g. "Cook"). */
	consumeLabel?: string;
	/** split mode — opens the private "Log my serving" dialog. */
	onEat?: (entryId: string) => void;
	/** split mode — opens the private dialog pre-filled with the existing log. */
	onEditServing?: (entryId: string) => void;
}

export function WeekView({
	dates,
	entries,
	planId,
	onAdd,
	mode = "legacy",
	onConsume,
	onCopy,
	onCopyDay,
	isConsuming = false,
	today,
	showSnackSlot = true,
	readOnly = false,
	selectedDate,
	onSelectDate,
	triggeredAllergensByMealId = {},
	readyMealIds = {},
	supplyDayInclusion = {},
	onToggleSupplyInclusion,
	togglingSupplyDate = null,
	goalsChrome = false,
	goalTargets = null,
	dayConsumedNutrients,
	consumeLabel,
	onEat,
	onEditServing,
}: WeekViewProps) {
	const isSplit = mode === "split";
	const slots = showSnackSlot
		? SLOT_TYPES
		: SLOT_TYPES.filter((s) => s !== "snack");

	const gridCols =
		dates.length === 3
			? "grid-cols-3"
			: dates.length === 5
				? "grid-cols-5"
				: "grid-cols-7";

	const showNoGoals = goalsChrome && !hasAnyGoalTarget(goalTargets);

	return (
		<div className={`grid ${gridCols} gap-2 min-w-0`}>
			{dates.map((date) => {
				const d = new Date(`${date}T00:00:00`);
				const dayName = getDayName(date, true);
				const dayNum = d.getDate();
				const isToday = date === today;
				const isPast = date < today;

				const dayEntries = entries.filter((e) => e.date === date);
				const totalCount = dayEntries.length;
				const consumedCount = dayEntries.filter((e) =>
					isSplit ? !!(e.cookedAt ?? e.consumedAt) : !!e.consumedAt,
				).length;
				const allConsumed = totalCount > 0 && consumedCount === totalCount;

				const isSelected = selectedDate === date;
				const progressStrip = goalsChrome
					? formatGoalProgressStrip(
							selectGoalProgressLines(
								goalTargets,
								dayConsumedNutrients?.[date] ?? emptyDayNutrientTotals(),
							),
						)
					: "";

				return (
					<div
						key={date}
						className={`flex flex-col gap-2 min-w-0 ${isPast ? "opacity-60" : ""} ${
							isSelected && !isToday ? "ring-2 ring-hyper-green rounded-xl" : ""
						}`}
					>
						{/* Day header wrapper — relative container for select button + copy button overlay */}
						<div className="relative">
							<button
								type="button"
								onClick={() => onSelectDate?.(date)}
								className={`text-center py-2 rounded-xl transition-colors w-full ${
									isToday
										? "bg-hyper-green text-on-hyper-green"
										: allConsumed
											? "bg-hyper-green/15 text-hyper-green"
											: isSelected
												? "bg-hyper-green/20 text-hyper-green"
												: "bg-platinum/50 text-muted hover:bg-platinum/80"
								}`}
								title={`Select ${dayName} for consume action`}
							>
								<p className="text-[10px] font-semibold uppercase tracking-wide">
									{dayName}
								</p>
								<p className="text-sm font-bold">{dayNum}</p>
								{/* Meal count / completion indicator */}
								{totalCount > 0 && (
									<p className="text-[9px] font-mono mt-0.5 leading-none">
										{allConsumed
											? isSplit
												? "✓ prepared"
												: "✓ done"
											: `${consumedCount}/${totalCount}`}
									</p>
								)}
								{progressStrip ? (
									<p
										className="text-[8px] font-mono mt-0.5 leading-tight opacity-90 px-0.5 line-clamp-2"
										title={progressStrip}
									>
										{progressStrip}
									</p>
								) : null}
								{showNoGoals ? (
									<p className="text-[8px] font-mono mt-0.5 leading-tight opacity-90">
										No goals
									</p>
								) : null}
							</button>
							{/* Copy day button — overlaid top-right, always visible when day has entries */}
							{!readOnly && onCopyDay && totalCount > 0 && (
								<button
									type="button"
									onClick={() => onCopyDay(date)}
									aria-label={`Copy ${dayName} meals to other days`}
									className={`absolute top-1 right-1 p-0.5 rounded transition-colors z-10 ${
										isToday
											? "text-carbon/60 hover:text-carbon"
											: "text-current/60 hover:text-current"
									}`}
								>
									<svg
										className="w-3.5 h-3.5"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
										aria-hidden="true"
									>
										<title>Copy day</title>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={2}
											d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
										/>
									</svg>
								</button>
							)}
						</div>

						{onToggleSupplyInclusion && (
							<div className="flex justify-center">
								<ManifestDaySupplyToggle
									date={date}
									includedInSupply={supplyDayInclusion[date] !== false}
									onToggle={onToggleSupplyInclusion}
									disabled={togglingSupplyDate === date}
									compact
								/>
							</div>
						)}

						{/* Slots */}
						<div
							className={`flex-1 rounded-xl border p-2 space-y-2 ${
								isToday
									? "border-hyper-green/20 bg-hyper-green/5"
									: allConsumed
										? "border-hyper-green/15 bg-hyper-green/5"
										: "border-platinum bg-platinum/40 dark:bg-white/5"
							}`}
						>
							{slots.map((slot) => (
								<MealSlot
									key={slot}
									slot={slot}
									date={date}
									entries={dayEntries}
									planId={planId}
									onAdd={onAdd}
									mode={mode}
									onConsume={onConsume}
									onCopy={onCopy}
									isConsuming={isConsuming}
									readOnly={readOnly}
									compact
									triggeredAllergensByMealId={triggeredAllergensByMealId}
									readyMealIds={readyMealIds}
									consumeLabel={consumeLabel}
									onEat={onEat}
									onEditServing={onEditServing}
								/>
							))}
						</div>
					</div>
				);
			})}
			{showNoGoals ? (
				<p className="col-span-full text-xs text-muted font-mono mt-1">
					No goals ·{" "}
					<Link
						to="/hub/settings"
						className="text-hyper-green underline-offset-2 hover:underline"
					>
						Set preferences
					</Link>
				</p>
			) : null}
		</div>
	);
}
