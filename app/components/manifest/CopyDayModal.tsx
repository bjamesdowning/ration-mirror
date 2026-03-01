import { useState } from "react";
import { getDayName } from "~/lib/manifest-dates";

const BULK_ENTRY_MAX = 50;

interface CopyDayModalProps {
	sourceDate: string;
	weekDates: string[];
	today: string;
	mealCount: number;
	onSubmit: (targetDates: string[]) => void;
	onClose: () => void;
	isSubmitting?: boolean;
}

export function CopyDayModal({
	sourceDate,
	weekDates,
	today,
	mealCount,
	onSubmit,
	onClose,
	isSubmitting = false,
}: CopyDayModalProps) {
	const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());

	const wouldExceedLimit = mealCount * selectedDates.size > BULK_ENTRY_MAX;

	const toggleDate = (date: string) => {
		setSelectedDates((prev) => {
			const next = new Set(prev);
			if (next.has(date)) next.delete(date);
			else next.add(date);
			return next;
		});
	};

	const handleSubmit = () => {
		if (selectedDates.size === 0 || wouldExceedLimit) return;
		onSubmit([...selectedDates]);
	};

	return (
		<div
			className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
			role="dialog"
			aria-modal="true"
			aria-label="Copy day to other days"
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
							Copy day
						</p>
						<h2 className="text-base font-bold text-carbon font-mono mt-0.5">
							{getDayName(sourceDate)}
						</h2>
						<p className="text-xs text-muted font-mono mt-0.5">
							{mealCount} meal{mealCount !== 1 ? "s" : ""} will be duplicated
						</p>
					</div>
					<button
						type="button"
						onClick={onClose}
						aria-label="Close copy day modal"
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
						Copy to
					</p>
					<div className="flex flex-wrap gap-2">
						{weekDates.map((date) => {
							const isSelected = selectedDates.has(date);
							const isSource = date === sourceDate;
							const isPast = date < today;
							const isDisabled = isSource || isPast;
							return (
								<button
									key={date}
									type="button"
									disabled={isDisabled}
									onClick={() => toggleDate(date)}
									aria-pressed={isSelected}
									aria-label={`${getDayName(date, true)}${isSource ? " (source)" : isPast ? " (past)" : ""}`}
									className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all ${
										isSource
											? "bg-hyper-green/20 text-hyper-green border border-hyper-green/30 cursor-not-allowed"
											: isPast
												? "bg-platinum/30 text-muted/50 cursor-not-allowed"
												: isSelected
													? "bg-hyper-green text-carbon shadow-glow-sm"
													: "bg-platinum text-carbon hover:bg-hyper-green/20 hover:text-hyper-green"
									}`}
								>
									{getDayName(date, true)}
									{isSource && (
										<span className="ml-1 text-[9px] opacity-70">src</span>
									)}
								</button>
							);
						})}
					</div>
				</div>

				{/* Overflow warning */}
				{wouldExceedLimit && (
					<p
						className="text-xs font-mono text-danger bg-danger/10 rounded-lg px-3 py-2"
						role="alert"
					>
						Too many entries ({mealCount} × {selectedDates.size} ={" "}
						{mealCount * selectedDates.size}). Max {BULK_ENTRY_MAX} per copy.
						Select fewer days.
					</p>
				)}

				{/* Actions */}
				<div className="flex gap-3 pt-1">
					<button
						type="button"
						onClick={onClose}
						className="flex-1 py-2.5 rounded-xl bg-platinum text-carbon font-semibold text-sm font-mono hover:bg-platinum/70 transition-all"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={handleSubmit}
						disabled={
							selectedDates.size === 0 || isSubmitting || wouldExceedLimit
						}
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
