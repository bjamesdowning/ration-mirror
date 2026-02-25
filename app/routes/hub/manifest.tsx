import { drizzle } from "drizzle-orm/d1";
import { useEffect, useMemo, useState } from "react";
import { useFetcher, useRevalidator, useSearchParams } from "react-router";
import {
	CalendarIcon,
	ConsumeIcon,
	ShareIcon,
} from "~/components/icons/PageIcons";
import { DayTab } from "~/components/manifest/DayTab";
import { DayView } from "~/components/manifest/DayView";
import { EmptyManifest } from "~/components/manifest/EmptyManifest";
import { MealPicker } from "~/components/manifest/MealPicker";
import { ShareManifestModal } from "~/components/manifest/ShareManifestModal";
import { WeekNavigator } from "~/components/manifest/WeekNavigator";
import { WeekView } from "~/components/manifest/WeekView";
import { FloatingActionBar } from "~/components/shell/FloatingActionBar";
import { Toast } from "~/components/shell/Toast";
import { UpgradePrompt } from "~/components/shell/UpgradePrompt";
import * as schema from "~/db/schema";
import { useToast } from "~/hooks/useToast";
import { requireActiveGroup } from "~/lib/auth.server";
import { useConfirm } from "~/lib/confirm-context";
import type { MealForPicker } from "~/lib/manifest.server";
import {
	ensureMealPlan,
	getMealsForPicker,
	getTodayISO,
	getWeekEnd,
	getWeekEntries,
	getWeekStart,
} from "~/lib/manifest.server";
import { getWeekDates } from "~/lib/manifest-dates";
import type { SlotType } from "~/lib/schemas/manifest";
import type { UserSettings } from "~/lib/types";
import type { Route } from "./+types/manifest";

export async function loader({ request, context }: Route.LoaderArgs) {
	const {
		session: { user },
		groupId,
	} = await requireActiveGroup(context, request);
	const db = context.cloudflare.env.DB;

	const drizzleDb = drizzle(db, { schema });
	const userData = await drizzleDb.query.user.findFirst({
		where: (u, { eq }) => eq(u.id, user.id),
	});
	const settings = (userData?.settings as UserSettings) || {};
	const weekStartPref: "sunday" | "monday" =
		settings.manifestSettings?.weekStart ?? "sunday";
	const showSnackSlot = settings.manifestSettings?.showSnackSlot ?? true;

	const url = new URL(request.url);
	const weekParam = url.searchParams.get("week");
	const today = getTodayISO();
	const currentWeekStart = weekParam
		? getWeekStart(weekParam, weekStartPref)
		: getWeekStart(today, weekStartPref);
	const currentWeekEnd = getWeekEnd(currentWeekStart);

	const [plan, meals] = await Promise.all([
		ensureMealPlan(db, groupId),
		getMealsForPicker(db, groupId),
	]);

	const entries = await getWeekEntries(
		db,
		plan.id,
		currentWeekStart,
		currentWeekEnd,
	);

	return {
		plan,
		entries,
		meals,
		today,
		currentWeekStart,
		weekStartPref,
		showSnackSlot,
	};
}

export default function ManifestPage({ loaderData }: Route.ComponentProps) {
	const {
		plan,
		entries,
		meals,
		today,
		currentWeekStart,
		weekStartPref,
		showSnackSlot,
	} = loaderData;

	const [searchParams] = useSearchParams();
	const weekDates = getWeekDates(currentWeekStart);

	// Active day for mobile day view (default: today if in week, else first day)
	const todayInWeek = weekDates.includes(today);
	const defaultActiveDay = todayInWeek ? today : weekDates[0];
	const [activeDay, setActiveDay] = useState(
		searchParams.get("day") ?? defaultActiveDay,
	);

	// Picker state
	const [pickerOpen, setPickerOpen] = useState(false);
	const [pickerSlot, setPickerSlot] = useState<SlotType>("dinner");
	const [pickerDate, setPickerDate] = useState(today);

	// Share modal
	const [shareOpen, setShareOpen] = useState(false);
	const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);

	const handleAdd = (slot: SlotType, date: string) => {
		setPickerSlot(slot);
		setPickerDate(date);
		setPickerOpen(true);
	};

	const addFetcher = useFetcher();
	const consumeFetcher = useFetcher<{
		consumed?: number;
		error?: string;
	}>();
	const revalidator = useRevalidator();
	const { confirm } = useConfirm();
	const consumeToast = useToast({ duration: 4000 });
	const consumeErrorToast = useToast({ duration: 6000 });

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

	const unconsumedForActiveDay = useMemo(
		() => entries.filter((e) => e.date === activeDay && !e.consumedAt).length,
		[entries, activeDay],
	);
	const unconsumedForToday = useMemo(
		() => entries.filter((e) => e.date === today && !e.consumedAt).length,
		[entries, today],
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

	const activeDayLabel = (() => {
		const d = new Date(`${activeDay}T00:00:00`);
		const days = [
			"Sunday",
			"Monday",
			"Tuesday",
			"Wednesday",
			"Thursday",
			"Friday",
			"Saturday",
		];
		return days[d.getDay()];
	})();

	const hasEntries = entries.length > 0;

	return (
		<>
			{/* Page header */}
			<header className="mb-5">
				<div className="flex items-center justify-between gap-3 flex-wrap">
					<div className="flex items-center gap-2">
						<CalendarIcon className="w-6 h-6 text-hyper-green" />
						<h1 className="text-2xl font-bold text-carbon">Manifest</h1>
						<span className="text-sm font-medium text-muted bg-platinum px-2 py-0.5 rounded-full">
							{entries.length}
						</span>
					</div>
					<div className="flex items-center gap-2">
						{unconsumedForToday > 0 && (
							<button
								type="button"
								onClick={() => handleConsumeAll(today)}
								disabled={consumeFetcher.state !== "idle"}
								className="flex items-center justify-center w-10 h-10 bg-hyper-green text-carbon rounded-lg hover:shadow-glow-sm transition-all font-medium disabled:opacity-50"
								title="Consume all meals for today (deduct from Cargo)"
								aria-label="Consume all meals for today"
							>
								<ConsumeIcon className="w-5 h-5" />
							</button>
						)}
						<WeekNavigator
							currentWeekStart={currentWeekStart}
							weekStart={weekStartPref}
						/>
						<button
							type="button"
							onClick={() => setShareOpen(true)}
							className="flex items-center gap-2 px-4 py-3 bg-platinum text-carbon font-semibold rounded-lg shadow-glow-sm hover:shadow-glow transition-all"
						>
							<ShareIcon className="w-4 h-4" />
							Share
						</button>
					</div>
				</div>
			</header>

			{/* Mobile: Day tabs + single-day view */}
			<div className="md:hidden">
				<DayTab
					dates={weekDates}
					activeDate={activeDay}
					today={today}
					onSelect={setActiveDay}
				/>
				<div className="mt-4">
					{!hasEntries ? (
						<EmptyManifest onAddFirst={() => handleAdd("dinner", activeDay)} />
					) : (
						<DayView
							date={activeDay}
							entries={entries}
							planId={plan.id}
							onAdd={handleAdd}
							onConsume={handleConsumeSingle}
							isConsuming={consumeFetcher.state !== "idle"}
							showSnackSlot={showSnackSlot}
						/>
					)}
				</div>
			</div>

			{/* Desktop: Full week grid (always show so date/slot context is clear) */}
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
					isConsuming={consumeFetcher.state !== "idle"}
					today={today}
					showSnackSlot={showSnackSlot}
				/>
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

			{/* Mobile FAB: Consume all for active day (icon only per spec) */}
			{hasEntries && unconsumedForActiveDay > 0 && (
				<FloatingActionBar
					actions={[
						{
							id: "consume-all",
							icon: <ConsumeIcon className="w-5 h-5" />,
							label: "Consume all meals",
							primary: true,
							onClick: () => handleConsumeAll(activeDay),
							disabled: consumeFetcher.state !== "idle",
						},
					]}
				/>
			)}

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

			{/* Consume error toast (e.g. insufficient Cargo) */}
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

			{/* Upgrade prompt when free-tier user tries to share manifest */}
			<UpgradePrompt
				open={showUpgradePrompt}
				onClose={() => setShowUpgradePrompt(false)}
				title="Crew Member required"
				description="Sharing meal plans is a Crew Member feature. Upgrade to unlock sharing, member invites, and unlimited capacity."
			/>
		</>
	);
}
