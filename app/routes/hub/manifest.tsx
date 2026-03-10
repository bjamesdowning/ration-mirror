import { useEffect, useMemo, useState } from "react";
import {
	useFetcher,
	useNavigate,
	useRevalidator,
	useSearchParams,
} from "react-router";
import { PanelToolbar } from "~/components/hub/PanelToolbar";
import {
	CalendarIcon,
	ChevronLeftIcon,
	ChevronRightIcon,
	ConsumeIcon,
	MoreVerticalIcon,
	ShareIcon,
} from "~/components/icons/PageIcons";
import { CalendarSpanSelector } from "~/components/manifest/CalendarSpanSelector";
import { CopyDayModal } from "~/components/manifest/CopyDayModal";
import { CopyEntryModal } from "~/components/manifest/CopyEntryModal";
import { DayTab } from "~/components/manifest/DayTab";
import { DayView } from "~/components/manifest/DayView";
import { EmptyManifest } from "~/components/manifest/EmptyManifest";
import { MealPicker } from "~/components/manifest/MealPicker";
import { PlanWeekButton } from "~/components/manifest/PlanWeekButton";
import { ShareManifestModal } from "~/components/manifest/ShareManifestModal";
import {
	formatWeekRange,
	WeekNavigator,
} from "~/components/manifest/WeekNavigator";
import { WeekSummary } from "~/components/manifest/WeekSummary";
import { WeekView } from "~/components/manifest/WeekView";
import { FloatingActionBar } from "~/components/shell/FloatingActionBar";
import { PageHeader } from "~/components/shell/PageHeader";
import { Toast } from "~/components/shell/Toast";
import { UpgradePrompt } from "~/components/shell/UpgradePrompt";
import { useToast } from "~/hooks/useToast";
import { parseAllergens } from "~/lib/allergens";
import { getUserSettings, requireActiveGroup } from "~/lib/auth.server";
import { useConfirm } from "~/lib/confirm-context";
import { AI_COSTS, checkBalance } from "~/lib/ledger.server";
import type {
	MealForPicker,
	MealPlanEntryWithMeal,
} from "~/lib/manifest.server";
import {
	ensureMealPlan,
	getMealsForPicker,
	getTodayISO,
	getTriggeredAllergens,
	getWeekEntries,
	getWeekStart,
} from "~/lib/manifest.server";
import { addDays, getCalendarDates } from "~/lib/manifest-dates";
import { checkMealReadiness } from "~/lib/matching.server";
import type { SlotType } from "~/lib/schemas/manifest";
import type { Route } from "./+types/manifest";

export async function loader({ request, context }: Route.LoaderArgs) {
	const {
		session: { user },
		groupId,
	} = await requireActiveGroup(context, request);
	const db = context.cloudflare.env.DB;

	const settings = await getUserSettings(db, user.id);
	const weekStartPref: "sunday" | "monday" =
		settings.manifestSettings?.weekStart ?? "sunday";
	const showSnackSlot = settings.manifestSettings?.showSnackSlot ?? true;
	const calendarSpan = (settings.manifestSettings?.calendarSpan ?? 5) as
		| 3
		| 5
		| 7;

	const url = new URL(request.url);
	const weekParam = url.searchParams.get("week");
	const today = getTodayISO();

	// For 7-day: ?week= is week start; for 3/5-day: ?week= is first visible day
	let anchor: string;
	if (weekParam) {
		anchor =
			calendarSpan === 7 ? getWeekStart(weekParam, weekStartPref) : weekParam;
	} else {
		anchor = calendarSpan === 7 ? getWeekStart(today, weekStartPref) : today;
	}

	const weekDates = getCalendarDates(calendarSpan, anchor, weekStartPref);
	const currentRangeStart = weekDates[0];
	const currentRangeEnd = weekDates[weekDates.length - 1];

	const userAllergens = parseAllergens(settings.allergens);

	const [plan, meals, credits] = await Promise.all([
		ensureMealPlan(db, groupId),
		getMealsForPicker(db, groupId),
		checkBalance(context.cloudflare.env, groupId),
	]);

	const entries = await getWeekEntries(
		db,
		plan.id,
		currentRangeStart,
		currentRangeEnd,
	);

	// Build a per-meal allergen map for the scheduled entries so slot cards
	// can display warnings without a per-card API call.
	const scheduledMealIds = [...new Set(entries.map((e) => e.mealId))];
	const [triggeredAllergensByMealId, readyMealIds] = await Promise.all([
		getTriggeredAllergens(db, scheduledMealIds, userAllergens),
		checkMealReadiness(context.cloudflare.env, groupId, scheduledMealIds),
	]);

	return {
		plan,
		entries,
		meals,
		today,
		currentRangeStart,
		currentRangeEnd,
		weekDates,
		calendarSpan,
		weekStartPref,
		showSnackSlot,
		credits,
		planWeekCost: AI_COSTS.MEAL_PLAN_WEEKLY,
		triggeredAllergensByMealId,
		readyMealIds,
	};
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

export default function ManifestPage({ loaderData }: Route.ComponentProps) {
	const {
		plan,
		entries,
		meals,
		today,
		currentRangeStart,
		currentRangeEnd,
		weekDates,
		calendarSpan,
		weekStartPref,
		showSnackSlot,
		credits,
		planWeekCost,
		triggeredAllergensByMealId,
		readyMealIds,
	} = loaderData;

	const [searchParams] = useSearchParams();

	// Planning always starts from today (or the week's first day if it's in the
	// future), so users never accidentally schedule meals in the past.
	const planStartDate =
		weekDates.find((d: string) => d >= today) ??
		weekDates[weekDates.length - 1];

	// Active day for mobile day view (default: today if in week, else first day)
	const todayInWeek = weekDates.includes(today);
	const defaultActiveDay = todayInWeek ? today : weekDates[0];
	const [activeDay, setActiveDay] = useState(
		searchParams.get("day") ?? defaultActiveDay,
	);
	// selectedDay drives the Consume All / deduct action on both mobile and desktop
	const [selectedDay, setSelectedDay] = useState(
		searchParams.get("day") ?? defaultActiveDay,
	);

	// Picker state
	const [pickerOpen, setPickerOpen] = useState(false);
	const [pickerSlot, setPickerSlot] = useState<SlotType>("dinner");
	const [pickerDate, setPickerDate] = useState(today);

	// Share modal
	const [shareOpen, setShareOpen] = useState(false);
	const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
	// Plan Week modal — controlled from FAB on mobile
	const [showPlanWeekModal, setShowPlanWeekModal] = useState(false);

	// -------------------------------------------------------------------------
	// Copy state
	// -------------------------------------------------------------------------
	const [copyEntry, setCopyEntry] = useState<MealPlanEntryWithMeal | null>(
		null,
	);
	const [copyDayDate, setCopyDayDate] = useState<string | null>(null);

	const handleAdd = (slot: SlotType, date: string) => {
		setPickerSlot(slot);
		setPickerDate(date);
		setPickerOpen(true);
	};

	const [lastBulkSource, setLastBulkSource] = useState<"copy" | "plan-week">(
		"copy",
	);

	const addFetcher = useFetcher();
	const bulkFetcher = useFetcher<{ inserted?: number; error?: string }>();
	const consumeFetcher = useFetcher<{
		consumed?: number;
		error?: string;
	}>();
	const revalidator = useRevalidator();
	const { confirm } = useConfirm();
	const consumeToast = useToast({ duration: 4000 });
	const consumeErrorToast = useToast({ duration: 6000 });
	const copyToast = useToast({ duration: 3000 });
	const copyErrorToast = useToast({ duration: 6000 });
	const planWeekToast = useToast({ duration: 4000 });
	const planWeekErrorToast = useToast({ duration: 6000 });

	const handleConsume = (entryIds: string[]) => {
		if (entryIds.length === 0) return;
		consumeFetcher.submit(JSON.stringify({ entryIds }), {
			method: "POST",
			action: `/api/meal-plans/${plan.id}/entries/consume`,
			encType: "application/json",
		});
	};

	const handleConsumeSingle = (entryId: string) => {
		handleConsume([entryId]);
	};

	const handleConsumeAll = async (date: string) => {
		const unconsumed = entries.filter((e) => e.date === date && !e.consumedAt);
		const ids = unconsumed.map((e) => e.id);
		if (ids.length === 0) return;
		if (
			!(await confirm({
				title: `Consume all ${ids.length} meal${ids.length === 1 ? "" : "s"} for this day?`,
				message: "Ingredients will be deducted from Cargo.",
				confirmLabel: "Consume All",
				variant: "warning",
			}))
		)
			return;
		handleConsume(ids);
	};

	// -------------------------------------------------------------------------
	// Copy entry handler — submits entries[] to the bulk endpoint
	// -------------------------------------------------------------------------
	const handleCopyEntrySubmit = (
		targetSlots: { date: string; slotType: SlotType }[],
	) => {
		if (!copyEntry || targetSlots.length === 0) return;
		setCopyEntry(null);
		setLastBulkSource("copy");
		const newEntries = targetSlots.map(({ date, slotType }) => ({
			mealId: copyEntry.mealId,
			date,
			slotType,
			...(copyEntry.servingsOverride != null && {
				servingsOverride: copyEntry.servingsOverride,
			}),
			...(copyEntry.notes != null && { notes: copyEntry.notes }),
		}));
		bulkFetcher.submit(JSON.stringify({ entries: newEntries }), {
			method: "POST",
			action: `/api/meal-plans/${plan.id}/entries/bulk`,
			encType: "application/json",
		});
	};

	// -------------------------------------------------------------------------
	// Copy day handler — copies all entries from a source day to target dates
	// -------------------------------------------------------------------------
	// -------------------------------------------------------------------------
	// Plan Week handler — submits AI-generated schedule to bulk endpoint
	// -------------------------------------------------------------------------
	const handleScheduleConfirmed = (
		schedule: Array<{
			date: string;
			slotType: string;
			mealId: string;
			mealName: string;
			notes?: string | null;
		}>,
	) => {
		if (schedule.length === 0) return;
		setLastBulkSource("plan-week");
		const newEntries = schedule.map((e, i) => ({
			mealId: e.mealId,
			date: e.date,
			slotType: e.slotType as SlotType,
			orderIndex: i,
			...(e.notes != null && { notes: e.notes }),
		}));
		bulkFetcher.submit(JSON.stringify({ entries: newEntries }), {
			method: "POST",
			action: `/api/meal-plans/${plan.id}/entries/bulk`,
			encType: "application/json",
		});
	};

	const handleCopyDaySubmit = (targetDates: string[]) => {
		if (!copyDayDate || targetDates.length === 0) return;
		const sourceDayEntries = entries.filter((e) => e.date === copyDayDate);
		if (sourceDayEntries.length === 0) return;
		setCopyDayDate(null);
		setLastBulkSource("copy");
		const newEntries = targetDates.flatMap((date) =>
			sourceDayEntries.map((e) => ({
				mealId: e.mealId,
				date,
				slotType: e.slotType as SlotType,
				orderIndex: e.orderIndex,
				...(e.servingsOverride != null && {
					servingsOverride: e.servingsOverride,
				}),
				...(e.notes != null && { notes: e.notes }),
			})),
		);
		bulkFetcher.submit(JSON.stringify({ entries: newEntries }), {
			method: "POST",
			action: `/api/meal-plans/${plan.id}/entries/bulk`,
			encType: "application/json",
		});
	};

	const activeDayEntryCount = useMemo(
		() => entries.filter((e) => e.date === activeDay).length,
		[entries, activeDay],
	);
	const unconsumedForActiveDay = useMemo(
		() => entries.filter((e) => e.date === activeDay && !e.consumedAt).length,
		[entries, activeDay],
	);
	const unconsumedForSelectedDay = useMemo(
		() => entries.filter((e) => e.date === selectedDay && !e.consumedAt).length,
		[entries, selectedDay],
	);

	// Set of dates that have at least one planned meal (for DayTab dot indicator)
	const plannedDates = useMemo(
		() => new Set(entries.map((e) => e.date)),
		[entries],
	);

	// Meal count for the day being copied (used by CopyDayModal)
	const copyDayMealCount = useMemo(
		() =>
			copyDayDate ? entries.filter((e) => e.date === copyDayDate).length : 0,
		[entries, copyDayDate],
	);

	useEffect(() => {
		if (consumeFetcher.state !== "idle" || !consumeFetcher.data) return;
		const data = consumeFetcher.data;
		if (typeof data.consumed === "number") {
			revalidator.revalidate();
			consumeToast.show();
		} else if (data.error) {
			consumeErrorToast.show();
		}
	}, [
		consumeFetcher.state,
		consumeFetcher.data,
		revalidator.revalidate,
		consumeToast.show,
		consumeErrorToast.show,
	]);

	// Revalidate and show toasts after bulk copy / plan-week confirm
	useEffect(() => {
		if (bulkFetcher.state !== "idle" || !bulkFetcher.data) return;
		const d = bulkFetcher.data;
		if (typeof d.inserted === "number") {
			revalidator.revalidate();
			if (lastBulkSource === "plan-week") {
				planWeekToast.show();
			} else {
				copyToast.show();
			}
		} else if (d.error) {
			if (lastBulkSource === "plan-week") {
				planWeekErrorToast.show();
			} else {
				copyErrorToast.show();
			}
		}
	}, [
		bulkFetcher.state,
		bulkFetcher.data,
		lastBulkSource,
		revalidator.revalidate,
		planWeekToast.show,
		planWeekErrorToast.show,
		copyToast.show,
		copyErrorToast.show,
	]);

	const handleMealSelect = (meal: MealForPicker, servingsOverride?: number) => {
		setPickerOpen(false);
		addFetcher.submit(
			JSON.stringify({
				mealId: meal.id,
				date: pickerDate,
				slotType: pickerSlot,
				servingsOverride: servingsOverride ?? null,
			}),
			{
				method: "POST",
				action: `/api/meal-plans/${plan.id}/entries`,
				encType: "application/json",
			},
		);
	};

	const activeDayLabel = DAY_NAMES[new Date(`${activeDay}T00:00:00`).getDay()];
	const selectedDayLabel =
		DAY_NAMES[new Date(`${selectedDay}T00:00:00`).getDay()];

	const hasEntries = entries.length > 0;
	const isCopying = bulkFetcher.state !== "idle";

	// Mobile week rocker helpers (compact chevrons only — no date label in title row)
	const navigate = useNavigate();
	const weekRangeLabel = formatWeekRange(currentRangeStart, currentRangeEnd);

	// Mobile "more options" sheet content — Share only (Plan Week is in FAB, Consume is in FAB)
	const moreOptionsContent = (
		<div className="space-y-3 pt-2">
			<button
				type="button"
				onClick={() => {
					setShareOpen(true);
				}}
				className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-hyper-green/10 text-hyper-green font-semibold rounded-xl hover:bg-hyper-green/20 transition-colors"
			>
				<ShareIcon className="w-5 h-5" />
				Share Manifest
			</button>
		</div>
	);

	return (
		<>
			{/* Page header — compact chevron rocker in title row on mobile; date as subtitle */}
			<PageHeader
				icon={<CalendarIcon className="w-6 h-6 text-hyper-green" />}
				title="Manifest"
				itemCount={hasEntries ? entries.length : undefined}
				filterContent={moreOptionsContent}
				actionIcon={<MoreVerticalIcon className="w-4 h-4" />}
				actionLabel="More options"
				sheetTitle="Options"
				mobileOnly
				titleRowExtra={
					/* Compact prev/next chevrons — no date label, no "Today" pill */
					<div className="md:hidden flex items-center gap-0.5">
						<button
							type="button"
							onClick={() =>
								navigate(`?week=${addDays(currentRangeStart, -calendarSpan)}`)
							}
							aria-label="Previous"
							className="p-1.5 rounded-lg text-muted hover:text-carbon dark:hover:text-white hover:bg-platinum dark:hover:bg-white/10 transition-colors"
						>
							<ChevronLeftIcon className="w-4 h-4" />
						</button>
						<button
							type="button"
							onClick={() =>
								navigate(`?week=${addDays(currentRangeStart, calendarSpan)}`)
							}
							aria-label="Next"
							className="p-1.5 rounded-lg text-muted hover:text-carbon dark:hover:text-white hover:bg-platinum dark:hover:bg-white/10 transition-colors"
						>
							<ChevronRightIcon className="w-4 h-4" />
						</button>
					</div>
				}
				subtitle={
					<div className="md:hidden flex items-center gap-2">
						<span className="text-xs font-mono text-muted">
							{weekRangeLabel}
						</span>
					</div>
				}
			/>

			<div className="pb-36 md:pb-0">
				{/* Desktop: week navigator + calendar span selector + action toolbar */}
				<div className="hidden md:block mb-5">
					<div className="flex items-center gap-4 mb-3">
						<WeekNavigator
							calendarSpan={calendarSpan}
							currentRangeStart={currentRangeStart}
							today={today}
							weekStartPref={weekStartPref}
						/>
						<CalendarSpanSelector currentSpan={calendarSpan} />
					</div>
					<PanelToolbar
						secondaryAction={
							<div className="flex gap-2 flex-wrap">
								{unconsumedForSelectedDay > 0 && (
									<button
										type="button"
										onClick={() => handleConsumeAll(selectedDay)}
										disabled={consumeFetcher.state !== "idle"}
										className="flex items-center gap-2 px-4 py-3 btn-secondary font-semibold rounded-lg transition-all disabled:opacity-50"
										title={`Consume all meals for ${selectedDayLabel} (deduct from Cargo)`}
									>
										<ConsumeIcon className="w-4 h-4" />
										Consume {selectedDayLabel}
									</button>
								)}
								<PlanWeekButton
									planId={plan.id}
									credits={credits}
									cost={planWeekCost}
									weekDates={weekDates}
									planStartDate={planStartDate}
									showSnackSlot={showSnackSlot}
									meals={meals}
									onScheduleConfirmed={handleScheduleConfirmed}
									isSubmitting={bulkFetcher.state !== "idle"}
								/>
								<button
									type="button"
									onClick={() => setShareOpen(true)}
									className="flex items-center gap-2 px-4 py-3 btn-secondary font-semibold rounded-lg transition-all"
								>
									<ShareIcon className="w-4 h-4" />
									Share
								</button>
							</div>
						}
					/>
				</div>

				{/* Week summary bar */}
				<WeekSummary entries={entries} />

				{/* Mobile: Day tabs + single-day view */}
				<div className="md:hidden">
					<DayTab
						dates={weekDates}
						activeDate={activeDay}
						today={today}
						onSelect={(date) => {
							setActiveDay(date);
							setSelectedDay(date);
						}}
						plannedDates={plannedDates}
					/>
					<div className="mt-4">
						{!hasEntries ? (
							<EmptyManifest onAdd={handleAdd} activeDate={activeDay} />
						) : (
							<DayView
								date={activeDay}
								entries={entries}
								planId={plan.id}
								onAdd={handleAdd}
								onConsume={handleConsumeSingle}
								onCopy={setCopyEntry}
								isConsuming={consumeFetcher.state !== "idle"}
								showSnackSlot={showSnackSlot}
								triggeredAllergensByMealId={triggeredAllergensByMealId}
								readyMealIds={readyMealIds}
							/>
						)}
					</div>
				</div>

				{/* Desktop: Full week grid */}
				<div className="hidden md:block">
					{!hasEntries && (
						<p className="text-sm text-muted mb-4">
							Add meals from your Galley using the + on any slot below.
						</p>
					)}
					<WeekView
						dates={weekDates}
						entries={entries}
						planId={plan.id}
						onAdd={handleAdd}
						onConsume={handleConsumeSingle}
						onCopy={setCopyEntry}
						onCopyDay={setCopyDayDate}
						isConsuming={consumeFetcher.state !== "idle"}
						today={today}
						showSnackSlot={showSnackSlot}
						selectedDate={selectedDay}
						onSelectDate={setSelectedDay}
						triggeredAllergensByMealId={triggeredAllergensByMealId}
						readyMealIds={readyMealIds}
					/>
				</div>
			</div>

			{/* Meal picker */}
			{pickerOpen && (
				<MealPicker
					dayLabel={activeDayLabel}
					slot={pickerSlot}
					meals={meals}
					onSelect={handleMealSelect}
					onClose={() => setPickerOpen(false)}
				/>
			)}

			{/* Copy Entry Modal */}
			{copyEntry && (
				<CopyEntryModal
					entry={copyEntry}
					weekDates={weekDates}
					today={today}
					onSubmit={handleCopyEntrySubmit}
					onClose={() => setCopyEntry(null)}
					isSubmitting={isCopying}
				/>
			)}

			{/* Copy Day Modal */}
			{copyDayDate && (
				<CopyDayModal
					sourceDate={copyDayDate}
					weekDates={weekDates}
					today={today}
					mealCount={copyDayMealCount}
					onSubmit={handleCopyDaySubmit}
					onClose={() => setCopyDayDate(null)}
					isSubmitting={isCopying}
				/>
			)}

			{/* Share modal */}
			{shareOpen && (
				<ShareManifestModal
					planId={plan.id}
					existingShareToken={plan.shareToken ?? null}
					onClose={() => setShareOpen(false)}
					onUpgradeRequired={() => {
						setShareOpen(false);
						setShowUpgradePrompt(true);
					}}
				/>
			)}

			{/* Mobile FAB: Plan Week (always) + Copy Day + Consume All (contextual) */}
			<FloatingActionBar
				actions={[
					{
						id: "plan-week",
						primary: true,
						icon: (
							<svg
								className="w-5 h-5"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
								aria-hidden="true"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M5 3l1.5 3.5L10 8l-3.5 1.5L5 13l-1.5-3.5L0 8l3.5-1.5L5 3zM19 12l1 2.5L22.5 16 20 17l-1 2.5-1-2.5L15.5 16l2.5-1L19 12zM12 1l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8L12 1z"
								/>
							</svg>
						),
						label: "Plan week",
						onClick: () => {
							setShowPlanWeekModal(true);
						},
						disabled: bulkFetcher.state !== "idle",
					},
					...(hasEntries && activeDayEntryCount > 0
						? [
								{
									id: "copy-day",
									icon: (
										<svg
											className="w-5 h-5"
											fill="none"
											stroke="currentColor"
											viewBox="0 0 24 24"
											aria-hidden="true"
										>
											<path
												strokeLinecap="round"
												strokeLinejoin="round"
												strokeWidth={2}
												d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
											/>
										</svg>
									),
									label: "Copy day",
									onClick: () => setCopyDayDate(activeDay),
									disabled: isCopying,
								},
							]
						: []),
					...(hasEntries && unconsumedForActiveDay > 0
						? [
								{
									id: "consume-all",
									icon: <ConsumeIcon className="w-5 h-5" />,
									label: "Consume all",
									onClick: () => handleConsumeAll(selectedDay),
									disabled: consumeFetcher.state !== "idle",
								},
							]
						: []),
				]}
			/>

			{/* Controlled Plan Week modal — opened by FAB on mobile */}
			<PlanWeekButton
				planId={plan.id}
				credits={credits}
				cost={planWeekCost}
				weekDates={weekDates}
				planStartDate={planStartDate}
				showSnackSlot={showSnackSlot}
				meals={meals}
				onScheduleConfirmed={handleScheduleConfirmed}
				isSubmitting={bulkFetcher.state !== "idle"}
				open={showPlanWeekModal}
				onOpenChange={setShowPlanWeekModal}
			/>

			{/* Consume success toast */}
			{consumeToast.isOpen && (
				<Toast
					variant="success"
					position="bottom-right"
					title="Meals consumed"
					description="Ingredients deducted from Cargo."
					onDismiss={consumeToast.hide}
				/>
			)}

			{/* Consume error toast */}
			{consumeErrorToast.isOpen && consumeFetcher.data?.error && (
				<Toast
					variant="info"
					position="bottom-right"
					title="Couldn't deduct ingredients"
					description={consumeFetcher.data.error.replace(
						/^Insufficient Cargo for:\s*/i,
						"You don't have enough: ",
					)}
					onDismiss={consumeErrorToast.hide}
				/>
			)}

			{/* Copy success toast */}
			{copyToast.isOpen && (
				<Toast
					variant="success"
					position="bottom-right"
					title="Meals copied"
					description="Days updated successfully."
					onDismiss={copyToast.hide}
				/>
			)}

			{/* Copy error toast */}
			{copyErrorToast.isOpen && bulkFetcher.data?.error && (
				<Toast
					variant="info"
					position="bottom-right"
					title="Copy failed"
					description={bulkFetcher.data.error}
					onDismiss={copyErrorToast.hide}
				/>
			)}

			{/* Plan Week success toast */}
			{planWeekToast.isOpen && (
				<Toast
					variant="success"
					position="bottom-right"
					title="Week planned!"
					description="Your meals have been added to the Manifest."
					onDismiss={planWeekToast.hide}
				/>
			)}

			{/* Plan Week error toast */}
			{planWeekErrorToast.isOpen && (
				<Toast
					variant="info"
					position="bottom-right"
					title="Planning failed"
					description="Could not save the week plan. Please try again."
					onDismiss={planWeekErrorToast.hide}
				/>
			)}

			{/* Upgrade prompt */}
			<UpgradePrompt
				open={showUpgradePrompt}
				onClose={() => setShowUpgradePrompt(false)}
				title="Crew Member required"
				description="Sharing meal plans is a Crew Member feature. Upgrade to unlock sharing, member invites, and unlimited capacity."
			/>
		</>
	);
}
