import { describe, expect, it } from "vitest";
import {
	CalendarDateSchema,
	FoodNutritionSnapshotV2Schema,
	NutrientAmountsV2Schema,
	NutritionSummaryV2Schema,
	PlannedDatesResponseV2Schema,
} from "../nutrition-contract";

describe("CalendarDateSchema", () => {
	it("accepts real Gregorian dates", () => {
		expect(CalendarDateSchema.parse("2026-02-28")).toBe("2026-02-28");
		expect(CalendarDateSchema.parse("2024-02-29")).toBe("2024-02-29");
	});

	it("rejects impossible calendar dates", () => {
		expect(CalendarDateSchema.safeParse("2026-02-31").success).toBe(false);
		expect(CalendarDateSchema.safeParse("2025-02-29").success).toBe(false);
		expect(CalendarDateSchema.safeParse("2026-13-01").success).toBe(false);
		expect(CalendarDateSchema.safeParse("2026-00-10").success).toBe(false);
	});
});

describe("NutrientAmountsV2Schema", () => {
	it("uses carbsG and preserves null as unknown", () => {
		const parsed = NutrientAmountsV2Schema.parse({
			energyKcal: 100,
			proteinG: null,
			carbsG: 12,
			fatG: 3,
			fiberG: null,
			sugarG: null,
			satFatG: null,
			sodiumMg: null,
			saltG: null,
		});
		expect(parsed.carbsG).toBe(12);
		expect(parsed.proteinG).toBeNull();
		expect(parsed).not.toHaveProperty("carbG");
	});
});

describe("FoodNutritionSnapshotV2Schema", () => {
	it("requires schemaVersion 2 and kind food", () => {
		const parsed = FoodNutritionSnapshotV2Schema.parse({
			schemaVersion: 2,
			kind: "food",
			source: "usda",
			confidence: 1,
			verified: true,
			sourceRef: "fdc:1",
			matchQuality: "verified",
			servingBasis: "per100g",
			nutrientCoverage: 1,
			per100g: {
				energyKcal: 100,
				proteinG: 1,
				carbsG: 2,
				fatG: 3,
				fiberG: null,
				sugarG: null,
				satFatG: null,
				sodiumMg: null,
				saltG: null,
			},
			perServing: null,
			fdcId: 1,
			description: "Test",
		});
		expect(parsed.kind).toBe("food");
	});
});

describe("NutritionSummaryV2Schema", () => {
	it("requires goalAsOf equal to inclusive to", () => {
		const parsed = NutritionSummaryV2Schema.parse({
			schemaVersion: 2,
			from: "2026-08-01",
			to: "2026-08-07",
			goalAsOf: "2026-08-07",
			totals: {
				energyKcal: 0,
				proteinG: 0,
				carbsG: 0,
				fatG: 0,
			},
			days: [],
			goal: null,
		});
		expect(parsed.goalAsOf).toBe("2026-08-07");
	});
});

describe("PlannedDatesResponseV2Schema", () => {
	it("accepts dates and optional consumedDates", () => {
		const parsed = PlannedDatesResponseV2Schema.parse({
			schemaVersion: 2,
			from: "2026-08-01",
			to: "2026-08-07",
			dates: ["2026-08-02"],
			consumedDates: ["2026-08-03"],
		});
		expect(parsed.dates).toEqual(["2026-08-02"]);
		expect(parsed.consumedDates).toEqual(["2026-08-03"]);
	});
});
