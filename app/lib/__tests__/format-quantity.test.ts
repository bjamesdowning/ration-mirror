import { describe, expect, it } from "vitest";
import { formatQuantity } from "~/lib/format-quantity";

describe("formatQuantity", () => {
	it("returns integer values directly without decimal points", () => {
		expect(formatQuantity(1, "g")).toBe("1 g");
		expect(formatQuantity(100, "ml")).toBe("100 ml");
		expect(formatQuantity(0, "unit")).toBe("0 unit");
	});

	it("uses vulgar fraction ¼ for 0.25", () => {
		expect(formatQuantity(0.25, "cup")).toBe("¼ cup");
	});

	it("uses vulgar fraction ½ for 0.5", () => {
		expect(formatQuantity(0.5, "tsp")).toBe("½ tsp");
	});

	it("uses vulgar fraction ¾ for 0.75", () => {
		expect(formatQuantity(0.75, "cup")).toBe("¾ cup");
	});

	it("uses vulgar fraction ⅓ for 0.333", () => {
		expect(formatQuantity(0.333, "cup")).toBe("⅓ cup");
	});

	it("uses vulgar fraction ⅔ for 0.667", () => {
		expect(formatQuantity(0.667, "cup")).toBe("⅔ cup");
	});

	it("uses vulgar fraction ⅛ for 0.125", () => {
		expect(formatQuantity(0.125, "tsp")).toBe("⅛ tsp");
	});

	it("combines whole number and fraction for values like 1.5", () => {
		expect(formatQuantity(1.5, "cup")).toBe("1½ cup");
		expect(formatQuantity(2.25, "cup")).toBe("2¼ cup");
	});

	it("combines whole number and fraction for values like 2.333", () => {
		expect(formatQuantity(2.333, "tbsp")).toBe("2⅓ tbsp");
	});

	it("falls back to decimal for values without a close fraction match", () => {
		// 0.44: diff to ⅜ (0.375) = 0.065, diff to ½ (0.5) = 0.06 — both > 0.05 threshold
		const result = formatQuantity(0.44, "ml");
		expect(result).toContain("0.44");
	});

	it("fraction check takes priority over count rounding for close fractions", () => {
		// 1.9 for "piece": frac is 0.9, closest fraction is ⅞ (0.875), diff=0.025 < 0.05 → fraction wins
		expect(formatQuantity(1.9, "piece")).toBe("1⅞ piece");
	});

	it("rounds count units to 0 decimal places when no fraction matches", () => {
		// 3.44 for "can": same as above — 0.44 has no fraction match → falls to count rounding
		expect(formatQuantity(3.44, "can")).toBe("3 can");
	});

	it("rounds continuous units >= 10 to 1 decimal place when no fraction matches", () => {
		// 10.44 for "g": frac is 0.44, no close fraction → 1 dp rounding applies
		expect(formatQuantity(10.44, "g")).toBe("10.4 g");
	});

	it("fraction check takes priority over decimal rounding for close fractions", () => {
		// 10.5 has frac=0.5 which matches ½ exactly → fraction wins
		expect(formatQuantity(10.5, "g")).toBe("10½ g");
	});

	it("rounds continuous units < 10 to 2 decimal places", () => {
		expect(formatQuantity(1.567, "ml")).toBe("1.57 ml");
	});

	it("handles large integer values (< 1000 fast path)", () => {
		expect(formatQuantity(999, "g")).toBe("999 g");
	});

	it("handles large integer values (>= 1000 skips fast path, falls to fraction/round logic)", () => {
		const result = formatQuantity(1000, "g");
		expect(result).toBe("1000 g");
	});
});
