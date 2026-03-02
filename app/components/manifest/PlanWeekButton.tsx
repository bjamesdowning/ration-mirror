import {
	AlertCircle,
	Calendar,
	Check,
	Sparkles,
	Trash2,
	X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import {
	AIFeatureIntroView,
	AIFeatureModal,
} from "~/components/ai/AIFeatureModal";
import type { MealForPicker } from "~/lib/manifest.server";
import { SLOT_LABELS, SLOT_TYPES, type SlotType } from "~/lib/schemas/manifest";
import {
	VARIETY_DESCRIPTIONS,
	VARIETY_LABELS,
	VARIETY_LEVELS,
	type VarietyLevel,
} from "~/lib/schemas/week-plan";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScheduleEntry {
	date: string;
	slotType: string;
	mealId: string;
	mealName: string;
	notes?: string | null;
}

interface PlanWeekButtonProps {
	planId: string;
	credits: number;
	cost?: number;
	/** ISO dates for the current visible week (7 strings). */
	weekDates: string[];
	/**
	 * The earliest date planning should start from — the later of today and
	 * the week's first day. Planning never schedules meals in the past.
	 */
	planStartDate: string;
	/** Whether the snack slot is enabled in user settings. */
	showSnackSlot?: boolean;
	/** Available meals (already loaded by manifest loader). */
	meals: MealForPicker[];
	/** Called with the confirmed schedule entries — parent submits to bulk endpoint. */
	onScheduleConfirmed: (entries: ScheduleEntry[]) => void;
	/** Whether the bulk submission is in flight. */
	isSubmitting?: boolean;
	/**
	 * Externally controlled open state. When provided the component operates
	 * in controlled mode and the trigger button is hidden — the parent is
	 * responsible for opening the modal (e.g. via a FAB action).
	 * Omit to use the built-in trigger button (uncontrolled mode).
	 */
	open?: boolean;
	/** Called when the modal requests to close (controlled mode only). */
	onOpenChange?: (open: boolean) => void;
}

const MAX_DIETARY_NOTE = 200;
const SLOT_DISPLAY_ORDER: SlotType[] = [
	"breakfast",
	"lunch",
	"dinner",
	"snack",
];

// ---------------------------------------------------------------------------
// Day header helper
// ---------------------------------------------------------------------------

const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatDayLabel(isoDate: string): string {
	const d = new Date(`${isoDate}T00:00:00`);
	return `${DAY_SHORT[d.getDay()]} ${d.getDate()}`;
}

function formatMonthYear(isoDate: string): string {
	const d = new Date(`${isoDate}T00:00:00`);
	return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

// ---------------------------------------------------------------------------
// Preview table component
// ---------------------------------------------------------------------------

function SchedulePreview({
	schedule,
	onRemove,
}: {
	schedule: ScheduleEntry[];
	onRemove: (idx: number) => void;
}) {
	// Group by date for display
	const byDate = new Map<
		string,
		Array<{ entry: ScheduleEntry; idx: number }>
	>();
	schedule.forEach((entry, idx) => {
		const existing = byDate.get(entry.date) ?? [];
		existing.push({ entry, idx });
		byDate.set(entry.date, existing);
	});

	const dates = [...byDate.keys()].sort();

	return (
		<div className="space-y-4">
			{dates.map((date) => {
				const dayEntries = byDate.get(date) ?? [];
				// Sort by slot display order
				dayEntries.sort((a, b) => {
					const ai = SLOT_DISPLAY_ORDER.indexOf(a.entry.slotType as SlotType);
					const bi = SLOT_DISPLAY_ORDER.indexOf(b.entry.slotType as SlotType);
					return ai - bi;
				});

				return (
					<div
						key={date}
						className="rounded-xl border border-platinum dark:border-white/10 overflow-hidden"
					>
						<div className="px-4 py-2.5 bg-platinum/50 dark:bg-white/5 border-b border-platinum dark:border-white/10">
							<span className="text-xs font-bold text-carbon dark:text-white uppercase tracking-wider">
								{formatDayLabel(date)}
							</span>
							<span className="text-xs text-muted ml-2">
								{formatMonthYear(date)}
							</span>
						</div>
						<div className="divide-y divide-platinum dark:divide-white/5">
							{dayEntries.map(({ entry, idx }) => (
								<div
									key={`${entry.date}-${entry.slotType}`}
									className="flex items-center justify-between gap-3 px-4 py-3 group hover:bg-platinum/20 dark:hover:bg-white/5 transition-colors"
								>
									<div className="flex items-center gap-3 min-w-0">
										<span className="shrink-0 text-[10px] font-bold text-hyper-green uppercase tracking-widest w-14">
											{SLOT_LABELS[entry.slotType as SlotType] ??
												entry.slotType}
										</span>
										<span className="text-sm text-carbon dark:text-white truncate capitalize">
											{entry.mealName}
										</span>
									</div>
									<button
										type="button"
										onClick={() => onRemove(idx)}
										aria-label={`Remove ${entry.mealName} from ${entry.slotType}`}
										className="shrink-0 p-1.5 rounded-lg text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
									>
										<X className="w-3.5 h-3.5" />
									</button>
								</div>
							))}
						</div>
					</div>
				);
			})}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Config form component
// ---------------------------------------------------------------------------

interface PlanWeekFormProps {
	/** Only the dates from planStartDate onwards (never past dates). */
	futureDates: string[];
	showSnackSlot: boolean;
	meals: MealForPicker[];
	onSubmit: (values: {
		days: number;
		slots: SlotType[];
		tag: string;
		dietaryNote: string;
		variety: VarietyLevel;
	}) => void;
	isLoading: boolean;
}

function PlanWeekForm({
	futureDates,
	showSnackSlot,
	meals,
	onSubmit,
	isLoading,
}: PlanWeekFormProps) {
	const maxDays = futureDates.length;
	const [days, setDays] = useState(maxDays);
	const defaultSlots: SlotType[] = ["breakfast", "lunch", "dinner"];
	const [slots, setSlots] = useState<Set<SlotType>>(new Set(defaultSlots));
	const [tag, setTag] = useState("");
	const [dietaryNote, setDietaryNote] = useState("");
	const [variety, setVariety] = useState<VarietyLevel>("medium");

	// Build unique tag list from loaded meals
	const availableTags = [...new Set(meals.flatMap((m) => m.tags))].sort();

	const visibleSlots = showSnackSlot
		? SLOT_TYPES
		: SLOT_TYPES.filter((s) => s !== "snack");

	const toggleSlot = (slot: SlotType) => {
		setSlots((prev) => {
			const next = new Set(prev);
			if (next.has(slot)) {
				if (next.size === 1) return prev; // always keep at least one
				next.delete(slot);
			} else {
				next.add(slot);
			}
			return next;
		});
	};

	const handleSubmit = () => {
		if (slots.size === 0 || isLoading) return;
		onSubmit({
			days,
			slots: [...slots],
			tag: tag.trim(),
			dietaryNote: dietaryNote.trim(),
			variety,
		});
	};

	const startLabel = futureDates[0] ? formatDayLabel(futureDates[0]) : "";
	const endDate = futureDates[days - 1] ?? futureDates[futureDates.length - 1];

	return (
		<div className="p-6 space-y-6">
			{/* Days slider */}
			<div className="space-y-2">
				<div className="flex items-center justify-between">
					<p className="text-sm font-semibold text-carbon dark:text-white">
						Days to plan
					</p>
					<span className="text-sm font-mono text-hyper-green">
						{days} day{days !== 1 ? "s" : ""}
					</span>
				</div>
				<input
					type="range"
					min={1}
					max={maxDays}
					value={days}
					onChange={(e) => setDays(Number(e.target.value))}
					className="w-full h-2 rounded-full appearance-none bg-platinum dark:bg-white/20 accent-hyper-green cursor-pointer"
					aria-label="Number of days to plan"
				/>
				<div className="flex justify-between text-[10px] text-muted font-mono">
					<span>{startLabel}</span>
					<span>{endDate ? formatDayLabel(endDate) : ""}</span>
				</div>
			</div>

			{/* Slot selector */}
			<fieldset className="space-y-2 border-0 p-0 m-0">
				<legend className="text-sm font-semibold text-carbon dark:text-white">
					Meal slots
				</legend>
				<div className="flex flex-wrap gap-2">
					{visibleSlots.map((slot) => {
						const active = slots.has(slot);
						return (
							<button
								key={slot}
								type="button"
								onClick={() => toggleSlot(slot)}
								aria-pressed={active}
								className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
									active
										? "bg-hyper-green text-carbon border-hyper-green shadow-glow-sm"
										: "border-platinum dark:border-white/20 text-muted hover:border-hyper-green/50 hover:text-carbon dark:hover:text-white"
								}`}
							>
								{SLOT_LABELS[slot]}
							</button>
						);
					})}
				</div>
			</fieldset>

			{/* Variety preference */}
			<fieldset className="space-y-2 border-0 p-0 m-0">
				<legend className="text-sm font-semibold text-carbon dark:text-white">
					Variety
				</legend>
				<div className="flex gap-2">
					{VARIETY_LEVELS.map((level) => (
						<button
							key={level}
							type="button"
							onClick={() => setVariety(level)}
							aria-pressed={variety === level}
							className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold transition-all border text-center ${
								variety === level
									? "bg-hyper-green text-carbon border-hyper-green"
									: "border-platinum dark:border-white/20 text-muted hover:border-hyper-green/50 hover:text-carbon dark:hover:text-white"
							}`}
						>
							{VARIETY_LABELS[level]}
						</button>
					))}
				</div>
				<p className="text-[11px] text-muted">
					{VARIETY_DESCRIPTIONS[variety]}
				</p>
			</fieldset>

			{/* Tag filter */}
			{availableTags.length > 0 && (
				<div className="space-y-2">
					<label
						htmlFor="plan-week-tag"
						className="text-sm font-semibold text-carbon dark:text-white"
					>
						Filter by tag{" "}
						<span className="font-normal text-muted">(optional)</span>
					</label>
					<select
						id="plan-week-tag"
						value={tag}
						onChange={(e) => setTag(e.target.value)}
						className="w-full px-3 py-2.5 rounded-lg border border-platinum dark:border-white/20 bg-white dark:bg-white/5 text-carbon dark:text-white text-sm"
					>
						<option value="">All meals</option>
						{availableTags.map((t) => (
							<option key={t} value={t}>
								{t}
							</option>
						))}
					</select>
				</div>
			)}

			{/* Dietary note */}
			<div className="space-y-2">
				<label
					htmlFor="plan-week-dietary"
					className="text-sm font-semibold text-carbon dark:text-white"
				>
					Dietary preferences{" "}
					<span className="font-normal text-muted">(optional)</span>
				</label>
				<textarea
					id="plan-week-dietary"
					value={dietaryNote}
					onChange={(e) =>
						setDietaryNote(e.target.value.slice(0, MAX_DIETARY_NOTE))
					}
					placeholder="e.g. no shellfish, prefer quick meals, vegetarian Monday"
					rows={2}
					className="w-full px-3 py-2.5 rounded-lg border border-platinum dark:border-white/20 bg-white dark:bg-white/5 text-carbon dark:text-white placeholder:text-muted text-sm resize-none"
					maxLength={MAX_DIETARY_NOTE}
				/>
				<p className="text-[11px] text-muted text-right">
					{dietaryNote.length}/{MAX_DIETARY_NOTE}
				</p>
			</div>

			{/* Submit */}
			<div className="pt-2">
				<button
					type="button"
					onClick={handleSubmit}
					disabled={isLoading || slots.size === 0}
					className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-hyper-green text-carbon font-bold rounded-xl shadow-glow hover:scale-[1.01] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
				>
					{isLoading ? (
						<>
							<span className="w-4 h-4 border-2 border-carbon/30 border-t-carbon rounded-full animate-spin" />
							Planning your week...
						</>
					) : (
						<>
							<Sparkles className="w-4 h-4" />
							Plan My Week
						</>
					)}
				</button>
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function PlanWeekButton({
	planId,
	credits,
	cost = 3,
	weekDates,
	planStartDate,
	showSnackSlot = true,
	meals,
	onScheduleConfirmed,
	isSubmitting = false,
	open: controlledOpen,
	onOpenChange,
}: PlanWeekButtonProps) {
	// Only offer dates from today (or week start if in the future) onwards —
	// never schedule meals in the past.
	const futureDates = weekDates.filter((d) => d >= planStartDate);
	const isControlled = controlledOpen !== undefined;

	type View = "intro" | "form" | "preview" | "error";
	const [internalOpen, setInternalOpen] = useState(false);
	const [view, setView] = useState<View>("intro");
	const [schedule, setSchedule] = useState<ScheduleEntry[]>([]);

	const showModal = isControlled ? controlledOpen : internalOpen;

	const planFetcher = useFetcher<{
		success?: boolean;
		schedule?: ScheduleEntry[];
		error?: string;
		required?: number;
		current?: number;
	}>();

	const isGenerating =
		planFetcher.state === "submitting" || planFetcher.state === "loading";

	const handleClose = () => {
		if (isControlled) {
			onOpenChange?.(false);
		} else {
			setInternalOpen(false);
		}
		setView("intro");
		setSchedule([]);
	};

	const handleFormSubmit = (values: {
		days: number;
		slots: SlotType[];
		tag: string;
		dietaryNote: string;
		variety: VarietyLevel;
	}) => {
		const payload: Record<string, unknown> = {
			days: values.days,
			startDate: planStartDate,
			slots: values.slots,
			variety: values.variety,
		};
		if (values.tag) payload.tag = values.tag;
		if (values.dietaryNote) payload.dietaryNote = values.dietaryNote;

		planFetcher.submit(JSON.stringify(payload), {
			method: "POST",
			action: `/api/meal-plans/${planId}/plan-week`,
			encType: "application/json",
		});
	};

	const handleRemoveEntry = (idx: number) => {
		setSchedule((prev) => prev.filter((_, i) => i !== idx));
	};

	const handleConfirm = () => {
		if (schedule.length === 0 || isSubmitting) return;
		onScheduleConfirmed(schedule);
		handleClose();
	};

	// Transition to preview/error when the fetch settles
	useEffect(() => {
		if (planFetcher.state !== "idle" || !planFetcher.data) return;
		const d = planFetcher.data;
		if (d.success && d.schedule && d.schedule.length > 0) {
			setSchedule(d.schedule);
			setView("preview");
		} else {
			setView("error");
		}
	}, [planFetcher.state, planFetcher.data]);

	// Move to loading state when fetch starts
	useEffect(() => {
		if (planFetcher.state === "submitting") {
			setView("form"); // stays on form, the form shows the loading spinner
		}
	}, [planFetcher.state]);

	const errorMessage = (() => {
		const d = planFetcher.data;
		if (!d?.error) return "Something went wrong. Please try again.";
		if (d.required != null && d.current != null) {
			return `Not enough credits. You need ${d.required} but have ${d.current}.`;
		}
		return d.error;
	})();

	const existingEntryDates = new Set(weekDates);
	const hasExistingEntries = schedule.some((e) =>
		existingEntryDates.has(e.date),
	);

	return (
		<>
			{/* Trigger button — hidden in controlled mode (parent e.g. FAB opens the modal) */}
			{!isControlled && (
				<button
					type="button"
					onClick={() => {
						setView("intro");
						setInternalOpen(true);
					}}
					className="flex items-center gap-2 px-4 py-2.5 bg-hyper-green text-carbon font-semibold rounded-lg shadow-glow-sm hover:shadow-glow transition-all text-sm"
				>
					<Sparkles className="w-4 h-4" />
					Plan My Week
				</button>
			)}

			<AIFeatureModal
				open={showModal}
				onClose={handleClose}
				title="Weekly Meal Planner"
				subtitle="Powered by Orbital Intelligence"
				icon={<Calendar className="w-5 h-5 text-hyper-green" />}
				maxWidth="lg"
			>
				{/* ── Intro view ── */}
				{view === "intro" && (
					<AIFeatureIntroView
						description="AI schedules your Galley meals across your week — picking the right dish for each slot, respecting your dietary preferences, and maximising variety so no two days feel the same."
						cost={cost}
						costLabel="per week plan"
						credits={credits}
						onCancel={handleClose}
						onConfirm={() => setView("form")}
						confirmLabel="Get Started"
					/>
				)}

				{/* ── Config form + loading ── */}
				{view === "form" && (
					<PlanWeekForm
						futureDates={futureDates}
						showSnackSlot={showSnackSlot}
						meals={meals}
						onSubmit={handleFormSubmit}
						isLoading={isGenerating}
					/>
				)}

				{/* ── Preview view ── */}
				{view === "preview" && schedule.length > 0 && (
					<div className="flex flex-col">
						<div className="p-6 flex-1 space-y-5 overflow-y-auto">
							{/* Overlap warning */}
							{hasExistingEntries && (
								<div className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 text-sm">
									<AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
									<p>
										These meals will be <strong>added</strong> to existing slots
										— not replaced. Remove individual entries below if needed.
									</p>
								</div>
							)}

							<div className="flex items-center justify-between">
								<p className="text-sm text-carbon/80 dark:text-white/80">
									{schedule.length} meal{schedule.length !== 1 ? "s" : ""}{" "}
									planned. Remove any you don't want before confirming.
								</p>
								<button
									type="button"
									onClick={() => setSchedule([])}
									className="flex items-center gap-1 text-xs text-muted hover:text-red-500 transition-colors"
								>
									<Trash2 className="w-3.5 h-3.5" />
									Clear all
								</button>
							</div>

							<SchedulePreview
								schedule={schedule}
								onRemove={handleRemoveEntry}
							/>
						</div>

						{/* Sticky footer */}
						<div className="sticky bottom-0 p-6 pt-4 bg-ceramic/95 dark:bg-[#1A1A1A]/95 border-t border-platinum dark:border-white/10 flex flex-wrap items-center justify-between gap-3">
							<button
								type="button"
								onClick={() => setView("form")}
								className="px-4 py-2.5 text-sm font-medium text-muted hover:text-carbon dark:hover:text-white border border-platinum dark:border-white/20 rounded-lg transition-colors"
							>
								Adjust
							</button>
							<button
								type="button"
								onClick={handleConfirm}
								disabled={schedule.length === 0 || isSubmitting}
								className="flex items-center gap-2 px-6 py-2.5 bg-hyper-green text-carbon font-semibold rounded-lg shadow-glow-sm hover:shadow-glow disabled:opacity-50 transition-all"
							>
								{isSubmitting ? (
									<span className="w-4 h-4 border-2 border-carbon/30 border-t-carbon rounded-full animate-spin" />
								) : (
									<Check className="w-4 h-4" />
								)}
								Fill My Week ({schedule.length})
							</button>
						</div>
					</div>
				)}

				{/* ── Error view ── */}
				{view === "error" && (
					<div className="flex flex-col items-center justify-center p-8 text-center gap-4">
						<div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center">
							<AlertCircle className="w-7 h-7 text-red-500" />
						</div>
						<div>
							<h4 className="text-lg font-bold text-carbon dark:text-white mb-1">
								Planning failed
							</h4>
							<p className="text-sm text-muted max-w-sm">{errorMessage}</p>
						</div>
						<div className="flex gap-3">
							<button
								type="button"
								onClick={handleClose}
								className="px-4 py-2.5 text-sm font-medium text-muted hover:text-carbon dark:hover:text-white border border-platinum dark:border-white/20 rounded-lg transition-colors"
							>
								Cancel
							</button>
							<button
								type="button"
								onClick={() => setView("form")}
								className="px-6 py-2.5 bg-hyper-green text-carbon font-semibold rounded-lg shadow-glow-sm hover:shadow-glow transition-all text-sm"
							>
								Try Again
							</button>
						</div>
					</div>
				)}
			</AIFeatureModal>
		</>
	);
}
