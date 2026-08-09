import { describe, expect, it } from "vitest";
import {
	isGoalEffectiveOnDate,
	nutritionIntakeRetentionCutoff,
	previousUtcCalendarDay,
} from "~/lib/nutrition/goal-effective";

describe("isGoalEffectiveOnDate", () => {
	it("includes effectiveFrom and open-ended effectiveTo", () => {
		expect(
			isGoalEffectiveOnDate(
				{ effectiveFrom: "2026-01-01", effectiveTo: null },
				"2026-01-01",
			),
		).toBe(true);
		expect(
			isGoalEffectiveOnDate(
				{ effectiveFrom: "2026-01-01", effectiveTo: null },
				"2026-06-15",
			),
		).toBe(true);
	});

	it("excludes dates before effectiveFrom", () => {
		expect(
			isGoalEffectiveOnDate(
				{ effectiveFrom: "2026-01-10", effectiveTo: null },
				"2026-01-09",
			),
		).toBe(false);
	});

	it("treats effectiveTo as inclusive", () => {
		expect(
			isGoalEffectiveOnDate(
				{ effectiveFrom: "2026-01-01", effectiveTo: "2026-01-31" },
				"2026-01-31",
			),
		).toBe(true);
		expect(
			isGoalEffectiveOnDate(
				{ effectiveFrom: "2026-01-01", effectiveTo: "2026-01-31" },
				"2026-02-01",
			),
		).toBe(false);
	});
});

describe("previousUtcCalendarDay", () => {
	it("returns the prior UTC calendar day", () => {
		expect(previousUtcCalendarDay("2026-03-01")).toBe("2026-02-28");
		expect(previousUtcCalendarDay("2026-01-01")).toBe("2025-12-31");
	});

	it("returns null for invalid dates", () => {
		expect(previousUtcCalendarDay("not-a-date")).toBeNull();
		expect(previousUtcCalendarDay("2026-02-30")).toBeNull();
	});
});

describe("nutritionIntakeRetentionCutoff", () => {
	it("subtracts retention days in UTC", () => {
		const now = new Date("2026-08-09T12:00:00.000Z");
		const cutoff = nutritionIntakeRetentionCutoff(now, 396);
		expect(cutoff.toISOString().slice(0, 10)).toBe("2025-07-09");
	});

	it("defaults to 396 days", () => {
		const now = new Date("2026-08-09T00:00:00.000Z");
		const cutoff = nutritionIntakeRetentionCutoff(now);
		expect(cutoff.toISOString().slice(0, 10)).toBe("2025-07-09");
	});
});
