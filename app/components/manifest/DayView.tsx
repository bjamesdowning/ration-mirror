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
import { SLOT_LABELS, SLOT_TYPES } from "~/lib/schemas/manifest";
import { ManifestDaySupplyToggle } from "./ManifestDaySupplyToggle";
import { MealSlot } from "./MealSlot";

export type DayIntakeRow = {
	id: string;
	slotType: string | null;
	servings: number;
	energyKcal: number;
	mealName: string | null;
};

interface DayViewProps {
	date: string;
	entries: MealPlanEntryWithMeal[];
	planId: string;
	onAdd: (slot: SlotType, date: string) => void;
	onConsume?: (entryId: string) => void;
	onCopy?: (entry: MealPlanEntryWithMeal) => void;
	isConsuming?: boolean;
	showSnackSlot?: boolean;
	readOnly?: boolean;
	triggeredAllergensByMealId?: Record<string, AllergenSlug[]>;
	readyMealIds?: Record<string, boolean>;
	includedInSupply?: boolean;
	onToggleSupplyInclusion?: (date: string) => void;
	togglingSupplyDate?: string | null;
	/** Both nutrition-manifest + nutrition-goals client flags on. */
	goalsChrome?: boolean;
	goalTargets?: UserGoalTargets | null;
	consumedNutrients?: DayNutrientTotals | null;
	/** Logged intake rows for this day (nutrition-manifest). */
	intakeRows?: DayIntakeRow[];
}

const MONTH_NAMES = [
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

export function DayView({
	date,
	entries,
	planId,
	onAdd,
	onConsume,
	onCopy,
	isConsuming = false,
	showSnackSlot = true,
	readOnly = false,
	triggeredAllergensByMealId = {},
	readyMealIds = {},
	includedInSupply = true,
	onToggleSupplyInclusion,
	togglingSupplyDate = null,
	goalsChrome = false,
	goalTargets = null,
	consumedNutrients = null,
	intakeRows = [],
}: DayViewProps) {
	const d = new Date(`${date}T00:00:00`);
	const dayName = getDayName(date);
	const formattedDate = `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;

	const dayEntries = entries.filter((e) => e.date === date);
	const totalCount = dayEntries.length;
	const consumedCount = dayEntries.filter((e) => !!e.consumedAt).length;

	const slots = showSnackSlot
		? SLOT_TYPES
		: SLOT_TYPES.filter((s) => s !== "snack");

	const dayIntakes = intakeRows.filter(Boolean);
	const progressLines = goalsChrome
		? selectGoalProgressLines(
				goalTargets,
				consumedNutrients ?? emptyDayNutrientTotals(),
			)
		: [];
	const progressStrip = formatGoalProgressStrip(progressLines);
	const showNoGoals = goalsChrome && !hasAnyGoalTarget(goalTargets);

	return (
		<div className="space-y-5">
			{/* Day heading with summary stats */}
			<div className="flex items-center gap-2 flex-wrap">
				<p className="text-xs text-muted font-mono">
					{dayName}, {formattedDate}
				</p>
				{onToggleSupplyInclusion && (
					<ManifestDaySupplyToggle
						date={date}
						includedInSupply={includedInSupply}
						onToggle={onToggleSupplyInclusion}
						disabled={togglingSupplyDate === date}
					/>
				)}
				{totalCount > 0 && (
					<>
						<span className="text-xs text-muted/40 font-mono">·</span>
						<p className="text-xs text-muted font-mono">
							{totalCount} {totalCount === 1 ? "meal" : "meals"}
						</p>
						<span className="text-xs text-muted/40 font-mono">·</span>
						<p
							className={`text-xs font-mono ${
								consumedCount === totalCount && totalCount > 0
									? "text-hyper-green"
									: "text-muted"
							}`}
						>
							{consumedCount} consumed
						</p>
					</>
				)}
				{progressStrip ? (
					<>
						<span className="text-xs text-muted/40 font-mono">·</span>
						<p className="text-xs text-muted font-mono">{progressStrip}</p>
					</>
				) : null}
				{showNoGoals ? (
					<>
						<span className="text-xs text-muted/40 font-mono">·</span>
						<p className="text-xs text-muted font-mono">
							No goals ·{" "}
							<Link
								to="/hub/settings"
								className="text-hyper-green underline-offset-2 hover:underline"
							>
								Set preferences
							</Link>
						</p>
					</>
				) : null}
			</div>

			{dayIntakes.length > 0 && (
				<div className="rounded-xl border border-platinum bg-platinum/30 px-3 py-2 space-y-1.5">
					<p className="text-[10px] font-mono font-semibold uppercase tracking-widest text-muted">
						Intake log
					</p>
					<ul className="space-y-1">
						{dayIntakes.map((row) => {
							const slotLabel =
								row.slotType && SLOT_TYPES.includes(row.slotType as SlotType)
									? SLOT_LABELS[row.slotType as SlotType]
									: null;
							const servingsLabel =
								row.servings % 1 === 0
									? String(row.servings)
									: row.servings.toFixed(1);
							return (
								<li
									key={row.id}
									className="flex items-baseline justify-between gap-3 text-xs font-mono"
								>
									<span className="text-carbon truncate min-w-0">
										{row.mealName ?? "Meal"}
										{slotLabel ? (
											<span className="text-muted"> · {slotLabel}</span>
										) : null}
									</span>
									<span className="text-muted whitespace-nowrap">
										{Math.round(row.energyKcal).toLocaleString("en-US")} kcal
										{" · "}
										{servingsLabel} sv
									</span>
								</li>
							);
						})}
					</ul>
				</div>
			)}

			{slots.map((slot) => (
				<MealSlot
					key={slot}
					slot={slot}
					date={date}
					entries={dayEntries}
					planId={planId}
					onAdd={onAdd}
					onConsume={onConsume}
					onCopy={onCopy}
					isConsuming={isConsuming}
					readOnly={readOnly}
					triggeredAllergensByMealId={triggeredAllergensByMealId}
					readyMealIds={readyMealIds}
				/>
			))}
		</div>
	);
}
