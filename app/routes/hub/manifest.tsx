import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	useFetcher,
	useNavigate,
	useRevalidator,
	useRouteLoaderData,
	useSearchParams,
} from "react-router";
import { PanelToolbar } from "~/components/hub/PanelToolbar";
import {
	CalendarIcon,
	ChevronLeftIcon,
	ChevronRightIcon,
	ConsumeIcon,
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
import {
	getUserSettings,
	requireActiveGroup,
	writeUserSettings,
} from "~/lib/auth.server";
import { useConfirm } from "~/lib/confirm-context";
import { AI_COSTS, checkBalance } from "~/lib/ledger.server";
import type {
	MealForPicker,
	MealPlanEntryWithMeal,
} from "~/lib/manifest.server";
import {
	ensureMealPlan,
	getTodayISO,
	getTriggeredAllergens,
	getWeekEntriesWithTags,
	getWeekStart,
} from "~/lib/manifest.server";
import { addDays, getCalendarDates } from "~/lib/manifest-dates";
import { getExcludedManifestDates } from "~/lib/manifest-supply.server";
import { checkMealReadiness } from "~/lib/matching.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import { getManifestReadyCacheVersion } from "~/lib/readiness-cache.server";
import type { SlotType } from "~/lib/schemas/manifest";
import { type TagRecord, toTagSlugs } from "~/lib/tags";
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

	const [plan, credits] = await Promise.all([
		ensureMealPlan(db, groupId),
		checkBalance(context.cloudflare.env, groupId),
	]);

	// Picker meals (MealForPicker[]) are loaded on-demand from /api/meals when
	// the user opens the picker — not eagerly here. This removes an N+1 tag
	// query and the full meal list payload from every Manifest page load.

	const entries = await getWeekEntriesWithTags(
		db,
		plan.id,
		currentRangeStart,
		currentRangeEnd,
	);

	// Build a per-meal allergen map for the scheduled entries so slot cards
	// can display warnings without a per-card API call.
	const scheduledMealIds = [...new Set(entries.map((e) => e.mealId))];

	// KV-cache readiness results for 5 minutes. The cache key encodes the group,
	// the visible week range, and a cheap hash of the scheduled meal IDs so the
	// result is invalidated automatically whenever the set of scheduled meals
	// changes or a new week is viewed.
	// getTriggeredAllergens runs in parallel with the readiness resolution so
	// neither blocks the other (important on cache-miss when checkMealReadiness
	// is a slow vector-matching call).
	async function resolveReadiness(): Promise<Record<string, boolean>> {
		if (scheduledMealIds.length === 0) return {};
		const idsHash =
			scheduledMealIds
				.slice()
				.sort()
				.join(",")
				.split("")
				.reduce((h, c) => (Math.imul(31, h) + c.charCodeAt(0)) | 0, 0) >>> 0;
		const kv = context.cloudflare.env.RATION_KV;
		const readyVer = await getManifestReadyCacheVersion(kv, groupId);
		const kvKey = `manifest-ready:${groupId}:v${readyVer}:${currentRangeStart}:${idsHash}`;
		const cached = await kv.get<Record<string, boolean>>(kvKey, "json");
		if (cached) return cached;
		const result = await checkMealReadiness(
			context.cloudflare.env,
			groupId,
			scheduledMealIds,
		);
		await kv.put(kvKey, JSON.stringify(result), { expirationTtl: 300 });
		return result;
	}

	const [readyMealIds, triggeredAllergensByMealId, supplyDayInclusion] =
		await Promise.all([
			resolveReadiness(),
			getTriggeredAllergens(db, scheduledMealIds, userAllergens),
			getExcludedManifestDates(
				db,
				groupId,
				currentRangeStart,
				currentRangeEnd,
			).then((excludedDates) => {
				const excludedSet = new Set(excludedDates);
				const inclusion: Record<string, boolean> = {};
				for (const date of weekDates) {
					inclusion[date] = !excludedSet.has(date);
				}
				return inclusion;
			}),
		]);

	return {
		plan,
		entries,
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
		supplyDayInclusion,
	};
}

export async function action({ request, context }: Route.ActionArgs) {
	const {
		session: { user },
	} = await requireActiveGroup(context, request);
	const formData = await request.formData();
	const intent = formData.get("intent");

	if (intent === "update-manifest-calendar-span") {
		const env = context.cloudflare.env;
		const rateLimitResult = await checkRateLimit(
			env.RATION_KV,
			"settings_mutation",
			user.id,
		);
		if (!rateLimitResult.allowed) {
			throw rateLimitResponse(
				rateLimitResult,
				"Too many requests. Please try again later.",
			);
		}

		const spanRaw = formData.get("span") as string;
		const span =
			spanRaw === "3" || spanRaw === "5" || spanRaw === "7"
				? (+spanRaw as 3 | 5 | 7)
				: null;
		if (span !== null) {
			const currentSettings = await getUserSettings(
				context.cloudflare.env.DB,
				user.id,
			);
			await writeUserSettings(context.cloudflare.env.DB, user.id, {
				...currentSettings,
				manifestSettings: {
					...currentSettings.manifestSettings,
					calendarSpan: span,
				},
			});
		}
		return { success: true };
	}

	return null;
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
		supplyDayInclusion: initialSupplyDayInclusion,
	} = loaderData;

	const supplyToggleFetcher = useFetcher<{
		date?: string;
		includedInSupply?: boolean;
	}>();
	const [supplyDayInclusion, setSupplyDayInclusion] = useState(
		initialSupplyDayInclusion,
	);
	const pendingSupplyDateRef = useRef<string | null>(null);
	const lastAppliedToggleRef = useRef<string | null>(null);
	const [togglingSupplyDate, setTogglingSupplyDate] = useState<string | null>(
		null,
	);

	const prevRangeStartRef = useRef(currentRangeStart);

	useEffect(() => {
		if (prevRangeStartRef.current === currentRangeStart) return;
		prevRangeStartRef.current = currentRangeStart;
		setSupplyDayInclusion(initialSupplyDayInclusion);
		pendingSupplyDateRef.current = null;
		setTogglingSupplyDate(null);
	}, [currentRangeStart, initialSupplyDayInclusion]);

	useEffect(() => {
		const data = supplyToggleFetcher.data;
		if (supplyToggleFetcher.state !== "idle") return;
		if (data?.date == null || data.includedInSupply == null) return;

		const date = String(data.date);
		const included = Boolean(data.includedInSupply);
		const responseKey = `${date}:${included}`;
		if (lastAppliedToggleRef.current === responseKey) return;
		if (
			pendingSupplyDateRef.current != null &&
			pendingSupplyDateRef.current !== date
		) {
			return;
		}

		lastAppliedToggleRef.current = responseKey;
		pendingSupplyDateRef.current = null;
		setTogglingSupplyDate(null);
		setSupplyDayInclusion((prev) => ({
			...prev,
			[date]: included,
		}));
	}, [supplyToggleFetcher.state, supplyToggleFetcher.data]);

	const handleToggleSupplyInclusion = (date: string) => {
		setSupplyDayInclusion((prev) => ({
			...prev,
			[date]: prev[date] === false,
		}));
		pendingSupplyDateRef.current = date;
		setTogglingSupplyDate(date);
		supplyToggleFetcher.submit(null, {
			method: "POST",
			action: `/api/meal-plans/supply-days/${date}`,
		});
	};

	// Picker meals are loaded client-side from /api/meals. The load is triggered
	// on mount so data is ready by the time the user opens the meal picker or
	// the PlanWeekButton modal (which uses the meal tag list to populate its
	// tag-filter dropdown). Subsequent opens reuse the cached fetcher result.
	// /api/meals returns full meal rows whose `tags` are TagRecord objects, not
	// slug strings. Normalize to MealForPicker (slug strings) so downstream tag
	// rendering (e.g. PlanWeekButton's tag-filter dropdown) never receives an
	// object as a React child.
	const pickerFetcher = useFetcher<{
		meals: Array<
			Omit<MealForPicker, "tags"> & { tags: TagRecord[] | string[] }
		>;
	}>();
	const pickerMeals: MealForPicker[] = (pickerFetcher.data?.meals ?? []).map(
		(meal) => ({ ...meal, tags: toTagSlugs(meal.tags) }),
	);
	const pickerMealsLoading =
		pickerFetcher.state !== "idle" && !pickerFetcher.data;

	useEffect(() => {
		if (!pickerFetcher.data && pickerFetcher.state === "idle") {
			pickerFetcher.load("/api/meals");
		}
	}, [pickerFetcher.data, pickerFetcher.state, pickerFetcher.load]);

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

	// Keep mobile day selection in range when calendar span changes
	useEffect(() => {
		if (weekDates.includes(activeDay)) return;
		const fallback = weekDates.includes(today) ? today : weekDates[0];
		setActiveDay(fallback);
		setSelectedDay(fallback);
	}, [weekDates, activeDay, today]);

	// Picker state
	const [pickerOpen, setPickerOpen] = useState(false);
	const [pickerSlot, setPickerSlot] = useState<SlotType>("dinner");
	const [pickerDate, setPickerDate] = useState(today);

	// Share modal
	const [shareOpen, setShareOpen] = useState(false);
	const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
	const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
	// Plan Week modal — controlled from FAB on mobile
	const [showPlanWeekModal, setShowPlanWeekModal] = useState(false);
	const rootData = useRouteLoaderData("root") as
		| { clientFlags?: { aiPlanWeek?: boolean } }
		| undefined;
	const aiPlanWeek = rootData?.clientFlags?.aiPlanWeek === true;

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
		requiresConfirmation?: boolean;
		partialCook?: boolean;
		missingIngredients?: Array<{
			name: string;
			required: number;
			available: number;
			unit: string;
		}>;
		deductions?: unknown[];
	}>();
	const pendingConsumeEntryIds = useRef<string[]>([]);
	const consumeConfirmationHandled = useRef(false);
	const revalidator = useRevalidator();
	const { confirm } = useConfirm();
	const consumeToast = useToast({ duration: 4000 });
	const consumeMarkOnlyToast = useToast({ duration: 4000 });
	const consumeErrorToast = useToast({ duration: 6000 });
	const copyToast = useToast({ duration: 3000 });
	const copyErrorToast = useToast({ duration: 6000 });
	const planWeekToast = useToast({ duration: 4000 });
	const planWeekErrorToast = useToast({ duration: 6000 });

	const submitConsume = useCallback(
		(entryIds: string[], confirmInsufficient = false) => {
			consumeFetcher.submit(JSON.stringify({ entryIds, confirmInsufficient }), {
				method: "POST",
				action: `/api/meal-plans/${plan.id}/entries/consume`,
				encType: "application/json",
			});
		},
		[consumeFetcher.submit, plan.id],
	);

	const handleConsume = (entryIds: string[]) => {
		if (entryIds.length === 0) return;
		pendingConsumeEntryIds.current = entryIds;
		consumeConfirmationHandled.current = false;
		submitConsume(entryIds, false);
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

		if (
			data.requiresConfirmation &&
			data.missingIngredients &&
			!consumeConfirmationHandled.current
		) {
			consumeConfirmationHandled.current = true;
			const names = data.missingIngredients.map((m) => m.name).join(", ");
			void (async () => {
				const ok = await confirm({
					title: "Missing ingredients",
					message: `You don't have enough: ${names}. Mark as eaten and deduct what's available from Cargo?`,
					confirmLabel: "Consume anyway",
					variant: "warning",
				});
				if (ok && pendingConsumeEntryIds.current.length > 0) {
					submitConsume(pendingConsumeEntryIds.current, true);
				} else {
					pendingConsumeEntryIds.current = [];
				}
			})();
			return;
		}

		if (typeof data.consumed === "number" && data.consumed > 0) {
			revalidator.revalidate();
			pendingConsumeEntryIds.current = [];
			const hadDeductions =
				Array.isArray(data.deductions) && data.deductions.length > 0;
			if (hadDeductions || data.partialCook) {
				consumeToast.show();
			} else {
				consumeMarkOnlyToast.show();
			}
		} else if (data.error) {
			pendingConsumeEntryIds.current = [];
			consumeErrorToast.show();
		}
	}, [
		consumeFetcher.state,
		consumeFetcher.data,
		revalidator.revalidate,
		consumeToast.show,
		consumeMarkOnlyToast.show,
		consumeErrorToast.show,
		confirm,
		submitConsume,
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

	const handleSpanChange = useCallback(() => {
		revalidator.revalidate();
	}, [revalidator.revalidate]);

	// Mobile filter sheet — date range + share
	const filterContent = (
		<div className="space-y-6">
			<div className="space-y-2">
				<p className="text-xs font-semibold text-muted uppercase tracking-widest">
					Date Range
				</p>
				<CalendarSpanSelector
					currentSpan={calendarSpan}
					onSpanChange={handleSpanChange}
					fullWidth
				/>
			</div>

			<div className="space-y-3 border-t border-platinum dark:border-white/10 pt-6">
				<button
					type="button"
					onClick={() => {
						setShareOpen(true);
						setIsFilterSheetOpen(false);
					}}
					className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-hyper-green/10 text-hyper-green font-semibold rounded-xl hover:bg-hyper-green/20 transition-colors"
				>
					<ShareIcon className="w-5 h-5" />
					Share Manifest
				</button>
			</div>
		</div>
	);

	return (
		<>
			{/* Page header — compact chevron rocker in title row on mobile; date as subtitle */}
			<PageHeader
				icon={<CalendarIcon className="w-6 h-6 text-hyper-green" />}
				title="Manifest"
				itemCount={hasEntries ? entries.length : undefined}
				filterContent={filterContent}
				onFilterOpenChange={setIsFilterSheetOpen}
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
						<CalendarSpanSelector
							currentSpan={calendarSpan}
							onSpanChange={handleSpanChange}
						/>
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
								{aiPlanWeek && (
									<PlanWeekButton
										planId={plan.id}
										credits={credits}
										cost={planWeekCost}
										weekDates={weekDates}
										planStartDate={planStartDate}
										showSnackSlot={showSnackSlot}
										meals={pickerMeals}
										onScheduleConfirmed={handleScheduleConfirmed}
										isSubmitting={bulkFetcher.state !== "idle"}
									/>
								)}
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
								includedInSupply={supplyDayInclusion[activeDay] !== false}
								onToggleSupplyInclusion={handleToggleSupplyInclusion}
								togglingSupplyDate={togglingSupplyDate}
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
						supplyDayInclusion={supplyDayInclusion}
						onToggleSupplyInclusion={handleToggleSupplyInclusion}
						togglingSupplyDate={togglingSupplyDate}
					/>
				</div>
			</div>

			{/* Meal picker */}
			{pickerOpen && (
				<MealPicker
					dayLabel={activeDayLabel}
					slot={pickerSlot}
					meals={pickerMeals}
					isLoading={pickerMealsLoading}
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

			{/* Mobile FAB: Plan Week (when enabled) + Copy Day + Consume All (contextual) */}
			<FloatingActionBar
				hidden={isFilterSheetOpen}
				actions={[
					...(aiPlanWeek
						? [
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
							]
						: []),
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
			{aiPlanWeek && (
				<PlanWeekButton
					planId={plan.id}
					credits={credits}
					cost={planWeekCost}
					weekDates={weekDates}
					planStartDate={planStartDate}
					showSnackSlot={showSnackSlot}
					meals={pickerMeals}
					onScheduleConfirmed={handleScheduleConfirmed}
					isSubmitting={bulkFetcher.state !== "idle"}
					open={showPlanWeekModal}
					onOpenChange={setShowPlanWeekModal}
				/>
			)}

			{consumeMarkOnlyToast.isOpen && (
				<Toast
					variant="success"
					position="bottom-right"
					title="Marked as eaten"
					description="Cargo unchanged."
					onDismiss={consumeMarkOnlyToast.hide}
				/>
			)}

			{/* Consume success toast */}
			{consumeToast.isOpen && (
				<Toast
					variant="success"
					position="bottom-right"
					title="Meals consumed"
					description={
						consumeFetcher.data?.partialCook
							? "Available ingredients deducted from Cargo."
							: "Ingredients deducted from Cargo."
					}
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
