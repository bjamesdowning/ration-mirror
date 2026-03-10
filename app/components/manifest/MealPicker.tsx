import { useEffect, useRef, useState } from "react";
import { CloseIcon, SearchIcon } from "~/components/icons/PageIcons";
import type { MealForPicker } from "~/lib/manifest.server";
import type { SlotType } from "~/lib/schemas/manifest";
import { SLOT_LABELS } from "~/lib/schemas/manifest";

interface MealPickerProps {
	dayLabel: string;
	slot: SlotType;
	meals: MealForPicker[];
	onSelect: (meal: MealForPicker, servingsOverride?: number) => void;
	onClose: () => void;
}

export function MealPicker({
	dayLabel,
	slot,
	meals,
	onSelect,
	onClose,
}: MealPickerProps) {
	const [query, setQuery] = useState("");
	const [selectedMeal, setSelectedMeal] = useState<MealForPicker | null>(null);
	const [servings, setServings] = useState<number | "">("");
	const searchRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		searchRef.current?.focus();
	}, []);

	// Close on Escape
	useEffect(() => {
		const handleKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		document.addEventListener("keydown", handleKey);
		return () => document.removeEventListener("keydown", handleKey);
	}, [onClose]);

	const filtered = query
		? meals.filter((m) => m.name.toLowerCase().includes(query.toLowerCase()))
		: meals;

	const handleConfirm = () => {
		if (!selectedMeal) return;
		const override =
			typeof servings === "number" && servings > 0 ? servings : undefined;
		onSelect(selectedMeal, override);
	};

	return (
		<>
			{/* Backdrop */}
			<button
				type="button"
				className="fixed inset-0 bg-carbon/40 backdrop-blur-sm z-[70] cursor-default"
				onClick={onClose}
				aria-label="Close picker"
			/>

			{/* Sheet — slides up from bottom on mobile, centered modal on desktop */}
			<div
				role="dialog"
				aria-modal="true"
				aria-label={`Add meal to ${dayLabel} ${SLOT_LABELS[slot]}`}
				className="fixed inset-x-0 bottom-0 md:inset-0 md:flex md:items-center md:justify-center z-[80]"
			>
				<div className="bg-ceramic rounded-t-2xl md:rounded-2xl shadow-2xl w-full md:max-w-md md:mx-auto flex flex-col max-h-[85vh] md:max-h-[70vh] safe-area-pb">
					{/* Header */}
					<div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
						<div>
							<p className="text-xs text-muted uppercase tracking-wide font-mono">
								{dayLabel} · {SLOT_LABELS[slot]}
							</p>
							<h2 className="text-lg font-bold text-carbon">Add Meal</h2>
						</div>
						<button
							type="button"
							onClick={onClose}
							className="text-muted hover:text-carbon transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
							aria-label="Close"
						>
							<CloseIcon className="w-5 h-5" />
						</button>
					</div>

					{/* Search */}
					<div className="px-5 pb-3 shrink-0">
						<div className="flex items-center gap-2 bg-platinum rounded-xl px-3 py-2.5">
							<SearchIcon className="w-4 h-4 text-muted shrink-0" />
							<input
								ref={searchRef}
								type="text"
								inputMode="search"
								autoComplete="off"
								placeholder="Search meals..."
								value={query}
								onChange={(e) => setQuery(e.target.value)}
								className="flex-1 bg-transparent text-carbon placeholder:text-muted text-sm focus:outline-none"
							/>
						</div>
					</div>

					{/* Meal list */}
					<div className="flex-1 overflow-y-auto px-3 pb-2">
						{filtered.length === 0 ? (
							<p className="text-center text-sm text-muted py-8">
								{query
									? "No meals match your search"
									: "No meals in Galley yet"}
							</p>
						) : (
							<ul className="space-y-1">
								{filtered.map((m) => (
									<li key={m.id}>
										<button
											type="button"
											onClick={() =>
												setSelectedMeal(selectedMeal?.id === m.id ? null : m)
											}
											className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-left transition-all ${
												selectedMeal?.id === m.id
													? "bg-hyper-green/10 border border-hyper-green/30 text-carbon"
													: "hover:bg-platinum text-carbon"
											}`}
										>
											<span className="font-medium text-sm capitalize">
												{m.name}
											</span>
											<span className="text-xs text-muted font-mono ml-2 shrink-0">
												{m.type === "provision"
													? `${m.servings} unit`
													: `${m.servings} srv`}
											</span>
										</button>
									</li>
								))}
							</ul>
						)}
					</div>

					{/* Servings + Confirm (visible when a meal is selected) */}
					{selectedMeal && (
						<div className="border-t border-platinum px-5 py-4 shrink-0 space-y-3">
							<div className="flex items-center gap-3">
								<label
									htmlFor="servings-override"
									className="text-sm font-medium text-carbon whitespace-nowrap"
								>
									{selectedMeal.type === "provision"
										? "Amount (×)"
										: "Servings"}
								</label>
								<input
									id="servings-override"
									type="number"
									inputMode="numeric"
									min={1}
									placeholder={String(selectedMeal.servings)}
									value={servings}
									onChange={(e) =>
										setServings(e.target.value ? Number(e.target.value) : "")
									}
									className="w-20 bg-platinum rounded-lg px-3 py-2 text-sm text-carbon text-center focus:outline-none focus:ring-2 focus:ring-hyper-green/50"
								/>
								<span className="text-xs text-muted">
									(default: {selectedMeal.servings}
									{selectedMeal.type === "provision" ? "×" : ""})
								</span>
							</div>
							<button
								type="button"
								onClick={handleConfirm}
								className="w-full py-3 bg-hyper-green text-carbon font-semibold rounded-xl shadow-glow-sm hover:shadow-glow transition-all"
							>
								Add to {SLOT_LABELS[slot]}
							</button>
						</div>
					)}
				</div>
			</div>
		</>
	);
}
