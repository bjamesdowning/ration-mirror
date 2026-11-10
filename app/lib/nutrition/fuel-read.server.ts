import { getUserSettings } from "~/lib/auth.server";
import { getCalendarDates, getWeekStart } from "~/lib/manifest-dates";
import { backfillFuelDates } from "./fuel-backfill.server";
import { personIsCrew, readFuelUsed } from "./fuel-cap.server";
import { FUEL_DAILY_LIMIT } from "./fuel-errors";
import {
	getActiveNutritionGoal,
	listNutritionIntakesForRange,
	getNutritionSummary as readNutritionSummary,
} from "./persist.server";

export async function loadFuelDay(
	db: D1Database,
	userId: string,
	date: string,
	now = new Date(),
) {
	await backfillFuelDates(db);
	const settings = await getUserSettings(db, userId);
	const weekStart = settings.manifestSettings?.weekStart ?? "sunday";
	const week = getCalendarDates(7, getWeekStart(date, weekStart), weekStart);
	const from = week[0] ?? date;
	const to = week[week.length - 1] ?? date;
	const [summary, history, crew, used, goal, marked] = await Promise.all([
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
		getActiveNutritionGoal(db, userId, date),
		db
			.prepare(
				`SELECT DISTINCT fuel_date AS date FROM nutrition_intake
				 WHERE user_id = ? AND fuel_date >= ? AND fuel_date <= ?
				   AND voided_at IS NULL`,
			)
			.bind(userId, from, to)
			.all<{ date: string }>(),
	]);
	const day = summary.days[0] ?? null;
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
		goal,
		totals: day,
		items: history.items,
	};
}
