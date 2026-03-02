import { describe, expect, it } from "vitest";
import { toExpiryDate } from "~/lib/date-utils";

describe("toExpiryDate", () => {
	it("returns null for null", () => {
		expect(toExpiryDate(null)).toBeNull();
	});

	it("returns null for undefined", () => {
		expect(toExpiryDate(undefined)).toBeNull();
	});

	it("passes through a Date object unchanged", () => {
		const d = new Date("2025-06-01T00:00:00Z");
		expect(toExpiryDate(d)).toBe(d);
	});

	it("treats values >= 1e12 as milliseconds", () => {
		const ms = 1700000000000; // > 1e12
		const result = toExpiryDate(ms);
		expect(result).toBeInstanceOf(Date);
		expect(result?.getTime()).toBe(ms);
	});

	it("treats values < 1e12 as Unix seconds and converts to ms", () => {
		const seconds = 1700000000; // < 1e12
		const result = toExpiryDate(seconds);
		expect(result).toBeInstanceOf(Date);
		expect(result?.getTime()).toBe(seconds * 1000);
	});

	it("parses numeric string as Unix seconds when < 1e12", () => {
		const result = toExpiryDate("1700000000");
		expect(result).toBeInstanceOf(Date);
		expect(result?.getTime()).toBe(1700000000 * 1000);
	});

	it("returns null for NaN string", () => {
		expect(toExpiryDate("not-a-number")).toBeNull();
	});

	it("returns null for empty string (parsed as NaN)", () => {
		expect(toExpiryDate("")).toBeNull();
	});
});
