import { describe, expect, it } from "vitest";
import {
	formatConversionResult,
	parseQuantityInput,
} from "../parse-quantity-input";

function value(input: string): number | null {
	const r = parseQuantityInput(input);
	return r.ok ? r.value : null;
}

describe("parseQuantityInput", () => {
	it("parses plain and comma decimals", () => {
		expect(value("2")).toBe(2);
		expect(value("1.5")).toBe(1.5);
		expect(value("1,5")).toBe(1.5);
		expect(value(".5")).toBe(0.5);
		expect(value(" 3 ")).toBe(3);
	});

	it("parses fractions and mixed numbers", () => {
		expect(value("1/2")).toBe(0.5);
		expect(value("3 / 4")).toBe(0.75);
		expect(value("1 1/2")).toBe(1.5);
		expect(value("2-1/4")).toBe(2.25);
	});

	it("parses unicode vulgar fractions", () => {
		expect(value("½")).toBe(0.5);
		expect(value("1½")).toBe(1.5);
		expect(value("1 ¾")).toBe(1.75);
		expect(value("⅓")).toBeCloseTo(1 / 3);
	});

	it("reports empty, invalid, negative and huge input", () => {
		expect(parseQuantityInput("")).toEqual({ ok: false, reason: "empty" });
		expect(parseQuantityInput("   ")).toEqual({ ok: false, reason: "empty" });
		expect(parseQuantityInput("abc")).toEqual({
			ok: false,
			reason: "invalid",
		});
		expect(parseQuantityInput("1/0")).toEqual({
			ok: false,
			reason: "invalid",
		});
		expect(parseQuantityInput("1e5")).toEqual({
			ok: false,
			reason: "invalid",
		});
		expect(parseQuantityInput("-2")).toEqual({
			ok: false,
			reason: "negative",
		});
		expect(parseQuantityInput("2000000")).toEqual({
			ok: false,
			reason: "too_large",
		});
	});
});

describe("formatConversionResult", () => {
	it("rounds to 4 significant figures without exponents", () => {
		expect(formatConversionResult(125.39164)).toBe("125.4");
		expect(formatConversionResult(0)).toBe("0");
		expect(formatConversionResult(0.000123456)).toBe("0.0001235");
		expect(formatConversionResult(236588)).toBe("236,600");
		expect(formatConversionResult(1e21)).not.toMatch(/e/i);
	});

	it("returns a dash for invalid values", () => {
		expect(formatConversionResult(Number.NaN)).toBe("—");
		expect(formatConversionResult(-1)).toBe("—");
	});
});
