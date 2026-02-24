import type { MealPlanEntryWithMeal } from "~/lib/manifest.server";
import type { SlotType } from "~/lib/schemas/manifest";
import { SLOT_TYPES } from "~/lib/schemas/manifest";
import { MealSlot } from "./MealSlot";

interface WeekViewProps {
	dates: string[];
	entries: MealPlanEntryWithMeal[];
	planId: string;
	onAdd: (slot: SlotType, date: string) => void;
	today: string;
	showSnackSlot?: boolean;
	readOnly?: boolean;
}

const DAY_NAMES_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function WeekView({
	dates,
	entries,
	planId,
	onAdd,
	today,
	showSnackSlot = true,
	readOnly = false,
}: WeekViewProps) {
	const slots = showSnackSlot
		? SLOT_TYPES
		: SLOT_TYPES.filter((s) => s !== "snack");

	return (
		<div className="grid grid-cols-7 gap-2 min-w-0">
			{dates.map((date) => {
				const d = new Date(`${date}T00:00:00`);
				const dayName = DAY_NAMES_SHORT[d.getDay()];
				const dayNum = d.getDate();
				const isToday = date === today;
				const isPast = date < today;

				const dayEntries = entries.filter((e) => e.date === date);

				return (
					<div
						key={date}
						className={`flex flex-col gap-2 min-w-0 ${isPast ? "opacity-60" : ""}`}
					>
						{/* Day header */}
						<div
							className={`text-center py-2 rounded-xl transition-colors ${
								isToday
									? "bg-hyper-green text-carbon"
									: "bg-platinum/50 text-muted"
							}`}
						>
							<p className="text-[10px] font-semibold uppercase tracking-wide">
								{dayName}
							</p>
							<p className="text-sm font-bold">{dayNum}</p>
						</div>

						{/* Slots */}
						<div
							className={`flex-1 rounded-xl border p-2 space-y-2 ${
								isToday
									? "border-hyper-green/20 bg-hyper-green/5"
									: "border-platinum bg-white/30"
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
									readOnly={readOnly}
									compact
								/>
							))}
						</div>
					</div>
				);
			})}
		</div>
	);
}
