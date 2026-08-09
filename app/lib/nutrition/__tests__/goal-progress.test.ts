import { describe, expect, it } from "vitest";
import {
	aggregateManifestDayNutrition,
	formatConsumedVsGoalKcal,
} from "../day-totals";
import {
	emptyDayNutrientTotals,
	formatGoalProgressStrip,
	goalTargetsFromRow,
	hasAnyGoalTarget,
	selectGoalProgressLines,
} from "../goal-progress";

describe("selectGoalProgressLines", () => {
	it("returns only nutrients with non-null targets", () => {
		const lines = selectGoalProgressLines(
			{
				dailyEnergyKcal: 2000,
				proteinG: 200,
				carbsG: null,
				fatG: null,
				fiberG: null,
			},
			{
				energyKcal: 1240,
				proteinG: 95,
				carbsG: 10,
				fatG: 5,
				fiberG: 0,
			},
		);
		expect(lines).toHaveLength(2);
		expect(lines[0]).toMatchObject({
			key: "energy",
			consumed: 1240,
			target: 2000,
		});
		expect(lines[1]).toMatchObject({
			key: "protein",
			consumed: 95,
			target: 200,
		});
		expect(formatGoalProgressStrip(lines)).toContain("kcal");
		expect(formatGoalProgressStrip(lines)).toContain("protein");
		expect(formatGoalProgressStrip(lines)).not.toContain("carbs");
	});

	it("treats explicit zero as a real target", () => {
		const lines = selectGoalProgressLines(
			{
				dailyEnergyKcal: null,
				proteinG: 0,
				carbsG: null,
				fatG: null,
				fiberG: null,
			},
			emptyDayNutrientTotals(),
		);
		expect(lines).toEqual([
			expect.objectContaining({ key: "protein", target: 0, consumed: 0 }),
		]);
	});

	it("returns empty when targets null or all unset", () => {
		expect(selectGoalProgressLines(null, emptyDayNutrientTotals())).toEqual([]);
		expect(
			selectGoalProgressLines(
				{
					dailyEnergyKcal: null,
					proteinG: null,
					carbsG: null,
					fatG: null,
					fiberG: null,
				},
				emptyDayNutrientTotals(),
			),
		).toEqual([]);
		expect(hasAnyGoalTarget(null)).toBe(false);
	});
});

describe("goalTargetsFromRow", () => {
	it("returns null when goal missing or empty", () => {
		expect(goalTargetsFromRow(null)).toBeNull();
		expect(
			goalTargetsFromRow({
				dailyEnergyKcal: null,
				proteinG: null,
				carbsG: null,
				fatG: null,
				fiberG: null,
			}),
		).toBeNull();
	});

	it("keeps partial preferences", () => {
		expect(
			goalTargetsFromRow({
				dailyEnergyKcal: 1500,
				proteinG: null,
				carbsG: null,
				fatG: null,
				fiberG: 10,
			}),
		).toEqual({
			dailyEnergyKcal: 1500,
			proteinG: null,
			carbsG: null,
			fatG: null,
			fiberG: 10,
		});
	});
});

describe("aggregateManifestDayNutrition", () => {
	it("sums macros per day from intakes", () => {
		const result = aggregateManifestDayNutrition(
			[],
			[
				{
					date: "2026-08-01",
					energyKcal: 500,
					proteinG: 40,
					carbsG: 20,
					fatG: 10,
				},
				{
					date: "2026-08-01",
					energyKcal: 300,
					proteinG: 20,
					carbsG: 10,
					fatG: 5,
				},
			],
			["2026-08-01"],
		);
		expect(result["2026-08-01"]?.consumed).toEqual({
			energyKcal: 800,
			proteinG: 60,
			carbsG: 30,
			fatG: 15,
			fiberG: 0,
		});
		expect(result["2026-08-01"]?.consumedKcal).toBe(800);
	});
});

describe("formatConsumedVsGoalKcal", () => {
	it("formats neutral ratio", () => {
		expect(formatConsumedVsGoalKcal(1240, 2000)).toBe("1,240 / 2,000");
	});
});
