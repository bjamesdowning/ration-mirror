import type { MealPlanEntryWithMeal } from "~/lib/manifest.server";
import type { SlotType } from "~/lib/schemas/manifest";
import { SLOT_TYPES } from "~/lib/schemas/manifest";
import { MealSlot } from "./MealSlot";

interface DayViewProps {
	date: string;
	entries: MealPlanEntryWithMeal[];
	planId: string;
	onAdd: (slot: SlotType, date: string) => void;
	showSnackSlot?: boolean;
	readOnly?: boolean;
}

const DAY_NAMES = [
	"Sunday",
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
];
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
	showSnackSlot = true,
	readOnly = false,
}: DayViewProps) {
	const d = new Date(`${date}T00:00:00`);
	const dayName = DAY_NAMES[d.getDay()];
	const formattedDate = `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;

	const slots = showSnackSlot
		? SLOT_TYPES
		: SLOT_TYPES.filter((s) => s !== "snack");

	return (
		<div className="space-y-5">
			{/* Day heading (accessible, visible on read-only shared view) */}
			<p className="text-xs text-muted font-mono">
				{dayName}, {formattedDate}
			</p>

			{slots.map((slot) => (
				<MealSlot
					key={slot}
					slot={slot}
					date={date}
					entries={entries}
					planId={planId}
					onAdd={onAdd}
					readOnly={readOnly}
				/>
			))}
		</div>
	);
}
