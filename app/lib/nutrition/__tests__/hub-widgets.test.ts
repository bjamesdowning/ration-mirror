import { describe, expect, it } from "vitest";
import {
	adherenceDayCount,
	averageDailyAmounts,
	clampedRatio,
	fillSparseNutritionDays,
	filterNutritionHubWidgetsByFlags,
	isNutritionHubWidgetsEnabled,
	normalizeNutritionHubNutrients,
	normalizeNutritionHubRange,
	nutrientOverage,
	nutrientRemaining,
	nutritionChartFill,
	nutritionRangeBounds,
} from "~/lib/nutrition/hub-widgets";

describe("isNutritionHubWidgetsEnabled", () => {
	it("is true when either flag is on", () => {
		expect(isNutritionHubWidgetsEnabled({ nutritionManifest: true })).toBe(
			true,
		);
		expect(isNutritionHubWidgetsEnabled({ nutritionGoals: true })).toBe(true);
		expect(
			isNutritionHubWidgetsEnabled({
				nutritionManifest: false,
				nutritionGoals: false,
			}),
		).toBe(false);
	});
});

describe("filterNutritionHubWidgetsByFlags", () => {
	it("drops nutrition widgets when disabled", () => {
		const widgets = [
			{ id: "hub-stats" },
			{ id: "nutrition-today" },
			{ id: "nutrition-trends" },
			{ id: "meals-ready" },
		];
		expect(
			filterNutritionHubWidgetsByFlags(widgets, false).map((w) => w.id),
		).toEqual(["hub-stats", "meals-ready"]);
		expect(filterNutritionHubWidgetsByFlags(widgets, true)).toEqual(widgets);
	});
});

describe("normalizeNutritionHubNutrients / range", () => {
	it("falls back to defaults", () => {
		expect(normalizeNutritionHubNutrients(undefined)).toEqual([
			"energy",
			"protein",
			"carbs",
			"fat",
		]);
		expect(normalizeNutritionHubNutrients(["protein", "bogus"])).toEqual([
			"protein",
		]);
		expect(normalizeNutritionHubRange(14)).toBe(14);
		expect(normalizeNutritionHubRange(9)).toBe(7);
	});
});

describe("remaining / overage / clamp", () => {
	it("computes remaining and overage", () => {
		expect(nutrientRemaining(800, 2000)).toBe(1200);
		expect(nutrientRemaining(2200, 2000)).toBe(0);
		expect(nutrientOverage(2200, 2000)).toBe(200);
		expect(nutrientOverage(800, 2000)).toBeNull();
		expect(clampedRatio(1.5)).toBe(1);
		expect(clampedRatio(null)).toBe(0);
	});

	it("maps consumed vs remaining chart fills", () => {
		expect(nutritionChartFill("consumed", 0.25)).toBe(0.25);
		expect(nutritionChartFill("remaining", 0.25)).toBe(0.75);
		expect(nutritionChartFill("remaining", 1.1)).toBe(0);
		expect(nutritionChartFill("remaining", null)).toBe(0);
		expect(nutritionChartFill("consumed", null)).toBe(0);
	});
});

describe("averageDailyAmounts / adherenceDayCount", () => {
	it("averages days and counts adherence", () => {
		const days = [
			{
				date: "2026-08-01",
				energyKcal: 1000,
				proteinG: 100,
				carbsG: 100,
				fatG: 40,
				entryCount: 1,
			},
			{
				date: "2026-08-02",
				energyKcal: 2000,
				proteinG: 50,
				carbsG: 200,
				fatG: 60,
				entryCount: 1,
			},
		];
		expect(averageDailyAmounts(days)).toEqual({
			energyKcal: 1500,
			proteinG: 75,
			carbsG: 150,
			fatG: 50,
		});
		expect(adherenceDayCount(days, { proteinG: 80 }, "protein")).toEqual({
			hit: 1,
			total: 2,
		});
	});
});

describe("nutritionRangeBounds", () => {
	it("returns inclusive lookback window", () => {
		expect(nutritionRangeBounds(7, "2026-08-10")).toEqual({
			from: "2026-08-04",
			to: "2026-08-10",
		});
	});
});

describe("fillSparseNutritionDays", () => {
	it("backfills missing calendar days with zeros", () => {
		const filled = fillSparseNutritionDays("2026-08-08", "2026-08-10", [
			{
				date: "2026-08-09",
				energyKcal: 500,
				proteinG: 40,
				carbsG: 50,
				fatG: 20,
				entryCount: 1,
			},
		]);
		expect(filled).toHaveLength(3);
		expect(filled[0]).toMatchObject({
			date: "2026-08-08",
			energyKcal: 0,
			entryCount: 0,
		});
		expect(filled[1]?.energyKcal).toBe(500);
		expect(filled[2]?.date).toBe("2026-08-10");
		expect(averageDailyAmounts(filled)?.energyKcal).toBeCloseTo(500 / 3);
	});
});
