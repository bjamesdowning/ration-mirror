import { describe, expect, it } from "vitest";
import {
	coerceFiniteInt,
	coerceFiniteNumber,
	serializeNutritionSummary,
	toIsoDateString,
} from "~/lib/nutrition/dto.server";

describe("coerceFiniteNumber", () => {
	it("passes through finite numbers", () => {
		expect(coerceFiniteNumber(3)).toBe(3);
		expect(coerceFiniteNumber(90.5)).toBe(90.5);
	});

	it("coerces D1 string aggregates", () => {
		expect(coerceFiniteNumber("3")).toBe(3);
		expect(coerceFiniteNumber("90.5")).toBe(90.5);
	});

	it("falls back for invalid values", () => {
		expect(coerceFiniteNumber("nope", 0)).toBe(0);
		expect(coerceFiniteNumber(Number.NaN, 7)).toBe(7);
	});
});

describe("coerceFiniteInt", () => {
	it("truncates fractional and string values", () => {
		expect(coerceFiniteInt(1.9)).toBe(1);
		expect(coerceFiniteInt("3")).toBe(3);
		expect(coerceFiniteInt("nope", 2)).toBe(2);
	});
});

describe("toIsoDateString", () => {
	it("formats Date and unix seconds", () => {
		const d = new Date("2026-08-11T21:00:00.000Z");
		expect(toIsoDateString(d)).toBe("2026-08-11T21:00:00.000Z");
		expect(toIsoDateString(Math.floor(d.getTime() / 1000))).toBe(
			"2026-08-11T21:00:00.000Z",
		);
	});
});

describe("serializeNutritionSummary", () => {
	it("emits numeric day totals when D1 returns strings", () => {
		const summary = serializeNutritionSummary({
			from: "2026-08-11",
			to: "2026-08-11",
			totals: {
				energyKcal: "90" as unknown as number,
				proteinG: "2" as unknown as number,
				carbsG: "10" as unknown as number,
				fatG: "1" as unknown as number,
			},
			days: [
				{
					date: "2026-08-11",
					energyKcal: "90" as unknown as number,
					proteinG: "2" as unknown as number,
					carbsG: "10" as unknown as number,
					fatG: "1" as unknown as number,
					coverageAvg: "0.9" as unknown as number,
					entryCount: "3" as unknown as number,
				},
			],
			goal: null,
		});

		expect(summary.days[0]?.entryCount).toBe(3);
		expect(typeof summary.days[0]?.entryCount).toBe("number");
		expect(summary.totals.energyKcal).toBe(90);
		expect(typeof summary.totals.energyKcal).toBe("number");
	});
});
