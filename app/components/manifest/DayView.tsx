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
import {
	type DiaryLayout,
	presentDiaryRows,
} from "~/lib/nutrition/diary-layout";
import type { SlotType } from "~/lib/schemas/manifest";
import { SLOT_LABELS, SLOT_TYPES } from "~/lib/schemas/manifest";
import { ManifestDaySupplyToggle } from "./ManifestDaySupplyToggle";
import { MealSlot } from "./MealSlot";

export type DayIntakeRow = {
	id: string;
	slotType: string | null;
	servings: number;
	energyKcal: number;
	proteinG?: number;
	carbsG?: number;
	fatG?: number;
	mealName: string | null;
	organizationName?: string | null;
	occurredAt?: string | null;
	personalLog?: boolean;
	loggedAmount?: number | null;
	loggedUnit?: "serving" | "g" | "oz" | null;
};

interface DayViewProps {
	date: string;
	entries: MealPlanEntryWithMeal[];
	planId: string;
	onAdd: (slot: SlotType, date: string) => void;
	/** legacy: existing Eat/consume flow. split: Cook/Log-split (nutrition-cook-log-split). */
	mode?: "legacy" | "split";
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
	/** nutrition-fast-log. Flag off leaves the log untappable. */
	fuelCapture?: boolean;
	onLogToFuel?: () => void;
	onEditIntake?: (row: DayIntakeRow) => void;
	/** Intake log only, without meal slots. */
	logOnly?: boolean;
	/** nutrition-fast-log. Absent or timeline is the timed list. */
	diaryLayout?: DiaryLayout;
	onDiaryLayout?: (layout: DiaryLayout) => void;
	/** split mode — label for the Cook button (e.g. "Cook"). */
	consumeLabel?: string;
	/** split mode — opens the private "Log my serving" dialog. */
	onEat?: (entryId: string) => void;
	/** split mode — opens the private dialog pre-filled with the existing log. */
	onEditServing?: (entryId: string) => void;
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
	mode = "legacy",
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
	fuelCapture = false,
	onLogToFuel,
	onEditIntake,
	logOnly = false,
	diaryLayout = "timeline",
	onDiaryLayout,
	consumeLabel,
	onEat,
	onEditServing,
}: DayViewProps) {
	const d = new Date(`${date}T00:00:00`);
	const dayName = getDayName(date);
	const formattedDate = `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;

	const isSplit = mode === "split";
	const dayEntries = entries.filter((e) => e.date === date);
	const totalCount = dayEntries.length;
	const consumedCount = dayEntries.filter((e) =>
		isSplit ? !!(e.cookedAt ?? e.consumedAt) : !!e.consumedAt,
	).length;

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
			{!logOnly && (
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
								{consumedCount} {isSplit ? "prepared" : "consumed"}
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
			)}

			{(dayIntakes.length > 0 || fuelCapture) && (
				<div className="rounded-xl border border-platinum bg-platinum/30 px-3 py-2 space-y-1.5">
					<div className="flex items-center justify-between gap-2">
						<p className="text-[10px] font-mono font-semibold uppercase tracking-widest text-muted">
							Intake log
						</p>
						{fuelCapture && onDiaryLayout ? (
							<fieldset className="flex gap-1 border-0 p-0">
								<legend className="sr-only">Diary layout</legend>
								{(["timeline", "slots"] as const).map((layout) => (
									<button
										key={layout}
										type="button"
										aria-pressed={diaryLayout === layout}
										onClick={() => onDiaryLayout(layout)}
										className={`rounded-full px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest ${
											diaryLayout === layout
												? "bg-carbon text-ceramic"
												: "text-muted"
										}`}
									>
										{layout === "timeline" ? "Timeline" : "Slots"}
									</button>
								))}
							</fieldset>
						) : null}
					</div>
					{dayIntakes.length === 0 ? (
						<button
							type="button"
							onClick={onLogToFuel}
							className="text-xs font-mono font-semibold text-hyper-green"
						>
							Log to Fuel
						</button>
					) : (
						<div className="space-y-2">
							{presentDiaryRows(dayIntakes, {
								controlVisible: fuelCapture,
								layout: diaryLayout,
							}).map((group) => (
								<div key={group.id} className="space-y-1">
									{group.label ? (
										<p className="text-[10px] font-mono uppercase tracking-widest text-muted">
											{group.label}
										</p>
									) : null}
									<ul className="space-y-1">
										{group.rows.map((row) => {
											const slotLabel =
												row.slotType &&
												SLOT_TYPES.includes(row.slotType as SlotType)
													? SLOT_LABELS[row.slotType as SlotType]
													: null;
											const servingsLabel =
												row.servings % 1 === 0
													? String(row.servings)
													: row.servings.toFixed(1);
											const timeLabel =
												fuelCapture && row.occurredAt
													? fuelTimeLabel(row.occurredAt)
													: "";
											const editable =
												fuelCapture && row.personalLog === true && onEditIntake;
											const body = (
												<>
													<span className="text-carbon truncate min-w-0">
														{row.mealName ?? "Meal"}
														{row.organizationName ? (
															<span className="text-muted">
																{" "}
																· {row.organizationName}
															</span>
														) : null}
														{slotLabel ? (
															<span className="text-muted"> · {slotLabel}</span>
														) : null}
													</span>
													<span className="text-muted whitespace-nowrap">
														{timeLabel ? `${timeLabel} · ` : ""}
														{Math.round(row.energyKcal).toLocaleString("en-US")}{" "}
														kcal
														{" · "}
														{servingsLabel} sv
													</span>
												</>
											);
											return (
												<li key={row.id} className="text-xs font-mono">
													{editable ? (
														<button
															type="button"
															onClick={() => onEditIntake(row)}
															className="flex w-full items-baseline justify-between gap-3 text-left"
														>
															{body}
														</button>
													) : (
														<div className="flex items-baseline justify-between gap-3">
															{body}
														</div>
													)}
												</li>
											);
										})}
									</ul>
								</div>
							))}
						</div>
					)}
				</div>
			)}

			{!logOnly &&
				slots.map((slot) => (
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
						triggeredAllergensByMealId={triggeredAllergensByMealId}
						readyMealIds={readyMealIds}
						consumeLabel={consumeLabel}
						onEat={onEat}
						onEditServing={onEditServing}
					/>
				))}
		</div>
	);
}

function fuelTimeLabel(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return "";
	return date.toLocaleTimeString(undefined, {
		hour: "numeric",
		minute: "2-digit",
	});
}
