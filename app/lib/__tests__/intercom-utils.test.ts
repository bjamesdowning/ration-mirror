import { describe, expect, it } from "vitest";
import { toUnixSeconds } from "../intercom-utils";

describe("toUnixSeconds", () => {
	it("converts ISO date strings to unix seconds", () => {
		expect(toUnixSeconds("2024-01-02T00:00:00.000Z")).toBe(1704153600);
	});

	it("converts Date instances", () => {
		expect(toUnixSeconds(new Date("2024-01-02T00:00:00.000Z"))).toBe(
			1704153600,
		);
	});

	it("treats large numbers as milliseconds", () => {
		expect(toUnixSeconds(1704153600000)).toBe(1704153600);
	});

	it("treats smaller numbers as seconds", () => {
		expect(toUnixSeconds(1704153600)).toBe(1704153600);
	});

	it("returns undefined for invalid input", () => {
		expect(toUnixSeconds(undefined)).toBeUndefined();
		expect(toUnixSeconds("not-a-date")).toBeUndefined();
		expect(toUnixSeconds({})).toBeUndefined();
	});
});
