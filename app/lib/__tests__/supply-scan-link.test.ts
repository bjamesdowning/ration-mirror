import { describe, expect, it } from "vitest";
import {
	availableSupplyForLink,
	collectSupplyLinkCandidates,
	computeDockHasDelta,
} from "~/lib/supply-scan-link";

describe("collectSupplyLinkCandidates", () => {
	it("unions paired and supply-only items by id", () => {
		const paired = [{ id: "a", name: "Milk" }, null, { id: "b", name: "Eggs" }];
		const supplyOnly = [
			{ id: "c", name: "Butter" },
			{ id: "a", name: "Milk updated" },
		];
		const result = collectSupplyLinkCandidates(paired, supplyOnly);
		expect(result).toHaveLength(3);
		expect(result.map((r) => r.id).sort()).toEqual(["a", "b", "c"]);
		expect(result.find((r) => r.id === "a")?.name).toBe("Milk updated");
	});

	it("returns only supply-only when pairs have no links", () => {
		const result = collectSupplyLinkCandidates(
			[null, undefined],
			[{ id: "x", name: "Flour" }],
		);
		expect(result).toEqual([{ id: "x", name: "Flour" }]);
	});
});

describe("availableSupplyForLink", () => {
	const all = [
		{ id: "a", name: "Milk" },
		{ id: "b", name: "Eggs" },
		{ id: "c", name: "Butter" },
	];

	it("excludes currently linked ids", () => {
		expect(availableSupplyForLink(all, ["b"])).toEqual([
			{ id: "a", name: "Milk" },
			{ id: "c", name: "Butter" },
		]);
	});

	it("returns all candidates when nothing is linked", () => {
		expect(availableSupplyForLink(all, [])).toEqual(all);
	});

	it("includes previously auto-matched items after unlink (empty linked set)", () => {
		// Regression: pool must include items from initial pairs, not only supplyOnly.
		const fromPairsAndList = collectSupplyLinkCandidates(
			[{ id: "auto", name: "Pancetta" }],
			[{ id: "list", name: "Cream" }],
		);
		expect(availableSupplyForLink(fromPairsAndList, [])).toEqual([
			{ id: "auto", name: "Pancetta" },
			{ id: "list", name: "Cream" },
		]);
		expect(availableSupplyForLink(fromPairsAndList, ["auto"])).toEqual([
			{ id: "list", name: "Cream" },
		]);
	});
});

describe("computeDockHasDelta", () => {
	it("returns false when no supply", () => {
		expect(computeDockHasDelta(1, "g", null)).toBe(false);
		expect(computeDockHasDelta(1, "g", undefined)).toBe(false);
	});

	it("returns false when qty and unit match", () => {
		expect(computeDockHasDelta(250, "g", { quantity: 250, unit: "g" })).toBe(
			false,
		);
	});

	it("returns true when quantity differs", () => {
		expect(computeDockHasDelta(250, "g", { quantity: 1, unit: "g" })).toBe(
			true,
		);
	});

	it("returns true when unit differs", () => {
		expect(computeDockHasDelta(1, "unit", { quantity: 1, unit: "g" })).toBe(
			true,
		);
	});
});
