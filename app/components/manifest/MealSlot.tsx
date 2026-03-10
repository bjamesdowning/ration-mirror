import { PlusIcon } from "~/components/icons/PageIcons";
import type { AllergenSlug } from "~/lib/allergens";
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
	onConsume?: (entryId: string) => void;
	onCopy?: (entry: MealPlanEntryWithMeal) => void;
	isConsuming?: boolean;
	readOnly?: boolean;
	compact?: boolean;
	/** Pre-computed map of mealId → triggered allergen slugs. */
	triggeredAllergensByMealId?: Record<string, AllergenSlug[]>;
	/** Pre-computed map of mealId → is-ready boolean. */
	readyMealIds?: Record<string, boolean>;
}

export function MealSlot({
	slot,
	date,
	entries,
	planId,
	onAdd,
	onConsume,
	onCopy,
	isConsuming = false,
	readOnly = false,
	compact = false,
	triggeredAllergensByMealId = {},
	readyMealIds = {},
}: MealSlotProps) {
	const slotEntries = entries
		.filter((e) => e.slotType === slot)
		.sort((a, b) => a.orderIndex - b.orderIndex);

	const consumedCount = slotEntries.filter((e) => !!e.consumedAt).length;
	const totalCount = slotEntries.length;
	const allConsumed = totalCount > 0 && consumedCount === totalCount;

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
								onConsume={onConsume}
								onCopy={onCopy}
								isConsuming={isConsuming}
								triggeredAllergens={triggeredAllergensByMealId[entry.mealId]}
								isReady={readyMealIds[entry.mealId]}
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
			{/* Slot header with consumed progress pill */}
			<div className="flex items-center justify-between">
				<h3 className="text-xs font-semibold text-muted uppercase tracking-widest font-mono">
					{SLOT_LABELS[slot]}
				</h3>
				{totalCount > 0 && (
					<span
						className={`text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded-full transition-colors ${
							allConsumed
								? "bg-hyper-green/15 text-hyper-green"
								: "bg-platinum text-muted"
						}`}
					>
						{consumedCount}/{totalCount}
					</span>
				)}
			</div>

			{/* Assigned meals */}
			<div className="space-y-2">
				{slotEntries.map((entry) => (
					<MealSlotCard
						key={entry.id}
						entry={entry}
						planId={planId}
						readOnly={readOnly}
						onConsume={onConsume}
						onCopy={onCopy}
						isConsuming={isConsuming}
						triggeredAllergens={triggeredAllergensByMealId[entry.mealId]}
						isReady={readyMealIds[entry.mealId]}
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
