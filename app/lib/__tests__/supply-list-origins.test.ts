import { describe, expect, it } from "vitest";
import { inferSupplyCategory } from "~/lib/supply-categories";
import { normalizeSupplyOrigins } from "~/lib/supply-item-origins";

describe("supply origins compatibility", () => {
	it("never emits unknown sourceOrigins values", () => {
		expect(
			normalizeSupplyOrigins([
				"manual",
				"receipt",
				"galley",
			] as unknown as Array<"manual" | "manifest" | "galley" | "cargo">),
		).toEqual(["manual", "galley"]);
	});
});

describe("category inference", () => {
	it("uses domain fallback without AI", () => {
		expect(inferSupplyCategory({ domain: "household" })).toBe("household");
		expect(inferSupplyCategory({ domain: "food" })).toBe("other");
		expect(inferSupplyCategory({ tagCategory: "dairy" })).toBe("dairy");
	});
});
