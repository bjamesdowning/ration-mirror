import { getUserSettings } from "~/lib/auth.server";
import { getCalendarDates, getWeekStart } from "~/lib/manifest-dates";
import { personIsCrew, readFuelUsed } from "./fuel-cap.server";
import { FUEL_DAILY_LIMIT } from "./fuel-errors";
import {
	listNutritionIntakesForRange,
	getNutritionSummary as readNutritionSummary,
} from "./persist.server";

export async function loadFuelDay(
	db: D1Database,
	userId: string,
	date: string,
	now = new Date(),
) {
	const settings = await getUserSettings(db, userId);
	const weekStart = settings.manifestSettings?.weekStart ?? "sunday";
	const week = getCalendarDates(7, getWeekStart(date, weekStart), weekStart);
	const from = week[0] ?? date;
	const to = week[week.length - 1] ?? date;
	const [summary, history, crew, used, marked] = await Promise.all([
		readNutritionSummary(db, userId, "", date, date, {
			dateField: "fuel",
			crossOrgDiary: true,
		}),
		listNutritionIntakesForRange(db, userId, "", date, date, {
			dateField: "fuel",
			limit: 100,
		}),
		personIsCrew(db, userId, now),
		readFuelUsed(db, userId, date),
		db
			.prepare(
				`SELECT DISTINCT coalesce(fuel_date, manifest_date) AS date
				 FROM nutrition_intake
				 WHERE user_id = ?
				   AND voided_at IS NULL
				   AND (
				     (fuel_date IS NOT NULL AND fuel_date >= ? AND fuel_date <= ?)
				     OR (fuel_date IS NULL AND manifest_date IS NOT NULL
				         AND manifest_date >= ? AND manifest_date <= ?)
				   )`,
			)
			.bind(userId, from, to, from, to)
			.all<{ date: string }>(),
	]);
	const day = summary.days.find((entry) => entry.date === date) ?? null;
	return {
		date,
		week,
		weekStart,
		loggedDates: (marked.results ?? []).map((row) => row.date),
		used,
		limit: crew ? null : FUEL_DAILY_LIMIT,
		crew,
		diaryLayout: settings.diaryLayout === "slots" ? "slots" : "timeline",
		fuelTimeZone:
			typeof settings.fuelTimeZone === "string" ? settings.fuelTimeZone : null,
		goal: summary.goal,
		totals: day,
		items: history.items,
	};
}
