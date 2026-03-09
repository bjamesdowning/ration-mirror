import { useState } from "react";
import type { MealPlanEntryWithMeal } from "~/lib/manifest.server";
import { getDayName } from "~/lib/manifest-dates";
import type { SlotType } from "~/lib/schemas/manifest";
import { SLOT_LABELS, SLOT_TYPES } from "~/lib/schemas/manifest";

interface CopyEntryModalProps {
	entry: MealPlanEntryWithMeal;
	weekDates: string[];
	today: string;
	onSubmit: (targetDates: { date: string; slotType: SlotType }[]) => void;
	onClose: () => void;
	isSubmitting?: boolean;
}

export function CopyEntryModal({
	entry,
	weekDates,
	today,
	onSubmit,
	onClose,
	isSubmitting = false,
}: CopyEntryModalProps) {
	const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
	const [slotOverride, setSlotOverride] = useState<SlotType>(
		entry.slotType as SlotType,
	);

	const toggleDate = (date: string) => {
		setSelectedDates((prev) => {
			const next = new Set(prev);
			if (next.has(date)) next.delete(date);
			else next.add(date);
			return next;
		});
	};

	const handleSubmit = () => {
		if (selectedDates.size === 0) return;
		onSubmit(
			[...selectedDates].map((date) => ({ date, slotType: slotOverride })),
		);
	};

	return (
		<div
			className="fixed inset-0 z-[75] flex items-end sm:items-center justify-center p-4 pb-24 sm:pb-4"
			role="dialog"
			aria-modal="true"
			aria-label="Copy meal to other days"
		>
			{/* Backdrop */}
			<button
				type="button"
				className="absolute inset-0 bg-carbon/60 backdrop-blur-sm"
				onClick={onClose}
				aria-label="Close"
			/>

			{/* Panel */}
			<div className="relative z-10 w-full max-w-sm bg-ceramic border border-platinum rounded-2xl shadow-glow p-5 space-y-5">
				{/* Header */}
				<div className="flex items-start justify-between gap-3">
					<div>
						<p className="text-[10px] font-mono font-semibold uppercase tracking-widest text-muted">
							Copy meal to
						</p>
						<h2 className="text-base font-bold text-carbon font-mono capitalize mt-0.5">
							{entry.mealName}
						</h2>
					</div>
					<button
						type="button"
						onClick={onClose}
						aria-label="Close copy modal"
						className="p-1.5 rounded-lg text-muted hover:text-carbon hover:bg-platinum transition-colors"
					>
						<svg
							className="w-4 h-4"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
							aria-hidden="true"
						>
							<title>Close</title>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M6 18L18 6M6 6l12 12"
							/>
						</svg>
					</button>
				</div>

				{/* Day selector */}
				<div className="space-y-2">
					<p className="text-xs font-mono font-semibold text-muted uppercase tracking-widest">
						Target days
					</p>
					<div className="flex flex-wrap gap-2">
						{weekDates.map((date) => {
							const isSelected = selectedDates.has(date);
							const isSource = date === entry.date;
							const isPast = date < today;
							const isDisabled = isSource || isPast;
							return (
								<button
									key={date}
									type="button"
									disabled={isDisabled}
									onClick={() => toggleDate(date)}
									className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all ${
										isSource
											? "bg-platinum/50 text-muted/50 cursor-not-allowed"
											: isPast
												? "bg-platinum/30 text-muted/50 cursor-not-allowed"
												: isSelected
													? "bg-hyper-green text-carbon shadow-glow-sm"
													: "btn-secondary hover:bg-hyper-green/20 hover:text-hyper-green"
									}`}
									aria-pressed={isSelected}
									aria-label={`${getDayName(date, true)}${isSource ? " (current)" : isPast ? " (past)" : ""}`}
								>
									{getDayName(date, true)}
									{isSource && (
										<span className="ml-1 opacity-50 text-[9px]">src</span>
									)}
								</button>
							);
						})}
					</div>
				</div>

				{/* Slot override */}
				<div className="space-y-2">
					<p className="text-xs font-mono font-semibold text-muted uppercase tracking-widest">
						Meal slot
					</p>
					<div className="flex flex-wrap gap-2">
						{SLOT_TYPES.map((slot) => (
							<button
								key={slot}
								type="button"
								onClick={() => setSlotOverride(slot)}
								aria-pressed={slotOverride === slot}
								className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all ${
									slotOverride === slot
										? "bg-hyper-green text-carbon shadow-glow-sm"
										: "btn-secondary hover:bg-hyper-green/20 hover:text-hyper-green"
								}`}
							>
								{SLOT_LABELS[slot]}
							</button>
						))}
					</div>
				</div>

				{/* Actions */}
				<div className="flex gap-3 pt-1">
					<button
						type="button"
						onClick={onClose}
						className="flex-1 py-2.5 rounded-xl btn-secondary font-semibold text-sm font-mono"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={handleSubmit}
						disabled={selectedDates.size === 0 || isSubmitting}
						className="flex-1 py-2.5 rounded-xl bg-hyper-green text-carbon font-semibold text-sm font-mono hover:shadow-glow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
					>
						{isSubmitting
							? "Copying…"
							: `Copy to ${selectedDates.size} day${selectedDates.size !== 1 ? "s" : ""}`}
					</button>
				</div>
			</div>
		</div>
	);
}
