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
	onCopyDay?: (date: string) => void;
	isConsuming?: boolean;
	showSnackSlot?: boolean;
	readOnly?: boolean;
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
	onCopyDay,
	isConsuming = false,
	showSnackSlot = true,
	readOnly = false,
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
				{!readOnly && onCopyDay && totalCount > 0 && (
					<button
						type="button"
						onClick={() => onCopyDay(date)}
						aria-label="Copy this entire day to other days"
						className="ml-auto flex items-center gap-1 text-[10px] font-mono font-semibold text-muted hover:text-hyper-green transition-colors px-2 py-0.5 rounded-lg hover:bg-hyper-green/10"
					>
						<svg
							className="w-3 h-3"
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
						Copy day
					</button>
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
				/>
			))}
		</div>
	);
}
