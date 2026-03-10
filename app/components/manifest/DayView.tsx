import type { AllergenSlug } from "~/lib/allergens";
import type { MealPlanEntryWithMeal } from "~/lib/manifest.server";
import { getDayName } from "~/lib/manifest-dates";
import type { SlotType } from "~/lib/schemas/manifest";
import { SLOT_TYPES } from "~/lib/schemas/manifest";
import { MealSlot } from "./MealSlot";

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

	return (
		<div className="space-y-5">
			{/* Day heading with summary stats */}
			<div className="flex items-center gap-2 flex-wrap">
				<p className="text-xs text-muted font-mono">
					{dayName}, {formattedDate}
				</p>
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
			</div>

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
