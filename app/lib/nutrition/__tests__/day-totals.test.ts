import { describe, expect, it } from "vitest";
import {
	aggregateManifestDayNutrition,
	formatConsumedVsGoalKcal,
} from "../day-totals";

describe("aggregateManifestDayNutrition", () => {
	it("sums planned from perServing × servings and consumed from intake", () => {
		const result = aggregateManifestDayNutrition(
			[
				{
					date: "2026-08-09",
					effectiveServings: 2,
					energyKcalPerServing: 400,
				},
				{
					date: "2026-08-09",
					effectiveServings: 1,
					energyKcalPerServing: 250,
				},
				{
					date: "2026-08-10",
					effectiveServings: 1,
					energyKcalPerServing: 500,
				},
			],
			[
				{ date: "2026-08-09", energyKcal: 450 },
				{ date: "2026-08-09", energyKcal: 300 },
			],
			["2026-08-09", "2026-08-10", "2026-08-11"],
		);

		expect(result["2026-08-09"]).toEqual({
			date: "2026-08-09",
			plannedKcal: 1050,
			consumed: {
				energyKcal: 750,
				proteinG: 0,
				carbsG: 0,
				fatG: 0,
				fiberG: 0,
			},
			consumedKcal: 750,
		});
		expect(result["2026-08-10"]).toEqual({
			date: "2026-08-10",
			plannedKcal: 500,
			consumed: {
				energyKcal: 0,
				proteinG: 0,
				carbsG: 0,
				fatG: 0,
				fiberG: 0,
			},
			consumedKcal: 0,
		});
		expect(result["2026-08-11"]).toEqual({
			date: "2026-08-11",
			plannedKcal: 0,
			consumed: {
				energyKcal: 0,
				proteinG: 0,
				carbsG: 0,
				fatG: 0,
				fiberG: 0,
			},
			consumedKcal: 0,
		});
	});

	it("skips null or non-finite energy and non-positive servings", () => {
		const result = aggregateManifestDayNutrition(
			[
				{
					date: "2026-08-09",
					effectiveServings: 1,
					energyKcalPerServing: null,
				},
				{
					date: "2026-08-09",
					effectiveServings: 0,
					energyKcalPerServing: 100,
				},
			],
			[{ date: "2026-08-09", energyKcal: Number.NaN }],
			["2026-08-09"],
		);
		expect(result["2026-08-09"]?.plannedKcal).toBe(0);
		expect(result["2026-08-09"]?.consumedKcal).toBe(0);
	});
});

describe("formatConsumedVsGoalKcal", () => {
	it("formats with thousands separators", () => {
		expect(formatConsumedVsGoalKcal(1240, 2000)).toBe("1,240 / 2,000");
	});
});
