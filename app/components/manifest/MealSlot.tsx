import { PlusIcon } from "~/components/icons/PageIcons";
import type { MealPlanEntryWithMeal } from "~/lib/manifest.server";
import type { SlotType } from "~/lib/schemas/manifest";
import { SLOT_LABELS } from "~/lib/schemas/manifest";
import { MealSlotCard } from "./MealSlotCard";

interface MealSlotProps {
	slot: SlotType;
	date: string;
	entries: MealPlanEntryWithMeal[];
	planId: string;
	onAdd: (slot: SlotType, date: string) => void;
	readOnly?: boolean;
	compact?: boolean;
}

export function MealSlot({
	slot,
	date,
	entries,
	planId,
	onAdd,
	readOnly = false,
	compact = false,
}: MealSlotProps) {
	const slotEntries = entries
		.filter((e) => e.slotType === slot)
		.sort((a, b) => a.orderIndex - b.orderIndex);

	if (compact) {
		return (
			<div className="space-y-1">
				{slotEntries.length === 0 ? (
					!readOnly && (
						<button
							type="button"
							onClick={() => onAdd(slot, date)}
							className="w-full border border-dashed border-platinum rounded-lg py-1.5 text-xs text-muted hover:border-hyper-green/50 hover:text-hyper-green transition-colors flex items-center justify-center gap-1"
						>
							<PlusIcon className="w-3 h-3" />
							<span>{SLOT_LABELS[slot]}</span>
						</button>
					)
				) : (
					<>
						{slotEntries.map((entry) => (
							<MealSlotCard
								key={entry.id}
								entry={entry}
								planId={planId}
								readOnly={readOnly}
							/>
						))}
						{!readOnly && (
							<button
								type="button"
								onClick={() => onAdd(slot, date)}
								className="w-full border border-dashed border-platinum rounded-lg py-1 text-xs text-muted hover:border-hyper-green/50 hover:text-hyper-green transition-colors flex items-center justify-center gap-1"
							>
								<PlusIcon className="w-3 h-3" />
							</button>
						)}
					</>
				)}
			</div>
		);
	}

	return (
		<div className="space-y-2">
			{/* Slot header */}
			<h3 className="text-xs font-semibold text-muted uppercase tracking-widest font-mono">
				{SLOT_LABELS[slot]}
			</h3>

			{/* Assigned meals */}
			<div className="space-y-2">
				{slotEntries.map((entry) => (
					<MealSlotCard
						key={entry.id}
						entry={entry}
						planId={planId}
						readOnly={readOnly}
					/>
				))}
			</div>

			{/* Add button */}
			{!readOnly && (
				<button
					type="button"
					onClick={() => onAdd(slot, date)}
					className="w-full flex items-center gap-2 px-3 py-2.5 border border-dashed border-platinum rounded-xl text-sm text-muted hover:border-hyper-green/50 hover:text-hyper-green hover:bg-hyper-green/5 transition-all group"
				>
					<PlusIcon className="w-4 h-4 group-hover:scale-110 transition-transform" />
					<span>Add meal</span>
				</button>
			)}
		</div>
	);
}
