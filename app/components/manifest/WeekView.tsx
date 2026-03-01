import type { MealPlanEntryWithMeal } from "~/lib/manifest.server";
import { getDayName } from "~/lib/manifest-dates";
import type { SlotType } from "~/lib/schemas/manifest";
import { SLOT_TYPES } from "~/lib/schemas/manifest";
import { MealSlot } from "./MealSlot";

interface WeekViewProps {
	dates: string[];
	entries: MealPlanEntryWithMeal[];
	planId: string;
	onAdd: (slot: SlotType, date: string) => void;
	onConsume?: (entryId: string) => void;
	onCopy?: (entry: MealPlanEntryWithMeal) => void;
	onCopyDay?: (date: string) => void;
	isConsuming?: boolean;
	today: string;
	showSnackSlot?: boolean;
	readOnly?: boolean;
}

export function WeekView({
	dates,
	entries,
	planId,
	onAdd,
	onConsume,
	onCopy,
	onCopyDay,
	isConsuming = false,
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
				const dayName = getDayName(date, true);
				const dayNum = d.getDate();
				const isToday = date === today;
				const isPast = date < today;

				const dayEntries = entries.filter((e) => e.date === date);
				const totalCount = dayEntries.length;
				const consumedCount = dayEntries.filter((e) => !!e.consumedAt).length;
				const allConsumed = totalCount > 0 && consumedCount === totalCount;

				return (
					<div
						key={date}
						className={`flex flex-col gap-2 min-w-0 ${isPast ? "opacity-60" : ""}`}
					>
						{/* Day header */}
						<div
							className={`group/dayheader relative text-center py-2 rounded-xl transition-colors ${
								isToday
									? "bg-hyper-green text-carbon"
									: allConsumed
										? "bg-hyper-green/15 text-hyper-green"
										: "bg-platinum/50 text-muted"
							}`}
						>
							<p className="text-[10px] font-semibold uppercase tracking-wide">
								{dayName}
							</p>
							<p className="text-sm font-bold">{dayNum}</p>
							{/* Meal count / completion indicator */}
							{totalCount > 0 && (
								<p className="text-[9px] font-mono mt-0.5 leading-none">
									{allConsumed ? "✓ done" : `${consumedCount}/${totalCount}`}
								</p>
							)}
							{/* Copy day — appears on hover when day has entries */}
							{!readOnly && onCopyDay && totalCount > 0 && (
								<button
									type="button"
									onClick={(e) => {
										e.stopPropagation();
										onCopyDay(date);
									}}
									aria-label={`Copy ${dayName} meals to other days`}
									className="absolute top-1 right-1 opacity-0 group-hover/dayheader:opacity-100 focus:opacity-100 p-0.5 rounded text-current/70 hover:text-current transition-all"
								>
									<svg
										className="w-2.5 h-2.5"
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

						{/* Slots */}
						<div
							className={`flex-1 rounded-xl border p-2 space-y-2 ${
								isToday
									? "border-hyper-green/20 bg-hyper-green/5"
									: allConsumed
										? "border-hyper-green/15 bg-hyper-green/5"
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
									onConsume={onConsume}
									onCopy={onCopy}
									isConsuming={isConsuming}
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
