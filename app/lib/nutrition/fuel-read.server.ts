import { getUserSettings } from "~/lib/auth.server";
import { getCalendarDates, getWeekStart } from "~/lib/manifest-dates";
import { personIsCrew, readFuelUsed } from "./fuel-cap.server";
import { fuelConsistencyDates } from "./fuel-consistency";
import { FUEL_DAILY_LIMIT } from "./fuel-errors";
import { isGoalEffectiveOnDate } from "./goal-effective";
import {
	listNutritionGoals,
	listNutritionIntakesForRange,
	getNutritionSummary as readNutritionSummary,
} from "./persist.server";

function finiteMacro(value: unknown): number {
	const number = typeof value === "number" ? value : Number(value);
	return Number.isFinite(number) ? number : 0;
}

/** A missing or non-positive nutrient stays null. Rounding matches the shade. */
function positiveMacro(value: unknown): number | null {
	const number = typeof value === "number" ? value : Number(value);
	if (!Number.isFinite(number) || Math.round(number) <= 0) return null;
	return number;
}

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
	const consistencyDates = fuelConsistencyDates(date);
	const consistencyFrom = consistencyDates[0] ?? date;
	const consistencyTo = consistencyDates[consistencyDates.length - 1] ?? date;
	const [summary, history, crew, used, marked, goals] = await Promise.all([
		readNutritionSummary(db, userId, "", consistencyFrom, consistencyTo, {
			dateField: "fuel",
			crossOrgDiary: true,
		}),
		listNutritionIntakesForRange(db, userId, "", date, date, {
			dateField: "fuel",
			limit: 100,
			withEstimate: true,
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
		listNutritionGoals(db, userId),
	]);
	const day = summary.days.find((entry) => entry.date === date) ?? null;
	const byDate = new Map(summary.days.map((entry) => [entry.date, entry]));
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
		consistency: consistencyDates.map((dayDate) => {
			const row = byDate.get(dayDate);
			const logged = Number(row?.entryCount ?? 0) > 0;
			const goal =
				goals.find((candidate) =>
					isGoalEffectiveOnDate(
						{
							effectiveFrom: candidate.effectiveFrom,
							effectiveTo: candidate.effectiveTo,
						},
						dayDate,
					),
				) ?? null;
			return {
				date: dayDate,
				logged,
				proteinG: logged ? finiteMacro(row?.proteinG) : null,
				carbsG: logged ? finiteMacro(row?.carbsG) : null,
				fatG: logged ? finiteMacro(row?.fatG) : null,
				goal: goal
					? {
							proteinG: positiveMacro(goal.proteinG),
							carbsG: positiveMacro(goal.carbsG),
							fatG: positiveMacro(goal.fatG),
						}
					: null,
			};
		}),
	};
}
