import { drizzle } from "drizzle-orm/d1";
import { useState } from "react";
import { useFetcher, useSearchParams } from "react-router";
import { CalendarIcon, ShareIcon } from "~/components/icons/PageIcons";
import { DayTab } from "~/components/manifest/DayTab";
import { DayView } from "~/components/manifest/DayView";
import { EmptyManifest } from "~/components/manifest/EmptyManifest";
import { MealPicker } from "~/components/manifest/MealPicker";
import { ShareManifestModal } from "~/components/manifest/ShareManifestModal";
import { WeekNavigator } from "~/components/manifest/WeekNavigator";
import { WeekView } from "~/components/manifest/WeekView";
import * as schema from "~/db/schema";
import { requireActiveGroup } from "~/lib/auth.server";
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

	const handleAdd = (slot: SlotType, date: string) => {
		setPickerSlot(slot);
		setPickerDate(date);
		setPickerOpen(true);
	};

	const addFetcher = useFetcher();

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
						<WeekNavigator
							currentWeekStart={currentWeekStart}
							weekStart={weekStartPref}
						/>
						<button
							type="button"
							onClick={() => setShareOpen(true)}
							className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-muted hover:text-carbon bg-platinum/50 hover:bg-platinum rounded-lg transition-all"
						>
							<ShareIcon className="w-4 h-4" />
							<span className="hidden sm:inline">Share</span>
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
				/>
			)}
		</>
	);
}
