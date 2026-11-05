import { describe, expect, it } from "vitest";
import { SIMILARITY_THRESHOLDS } from "~/lib/vector.server";
import {
	cookMatchForScore,
	decideStockNameMatch,
	NAME_SEARCH_RECALL_THRESHOLD,
	STOCK_NAME_MATCH_THRESHOLD,
	stockNameDisambiguationNote,
} from "../name-match";

const GAP = 0.1;

describe("decideStockNameMatch", () => {
	it("uses the cook threshold and a wider search recall floor", () => {
		expect(STOCK_NAME_MATCH_THRESHOLD).toBe(
			SIMILARITY_THRESHOLDS.INGREDIENT_MATCH,
		);
		expect(STOCK_NAME_MATCH_THRESHOLD).toBe(0.78);
		expect(NAME_SEARCH_RECALL_THRESHOLD).toBe(0.6);
		expect(NAME_SEARCH_RECALL_THRESHOLD).toBeLessThan(
			STOCK_NAME_MATCH_THRESHOLD,
		);
	});

	it("returns none when there is no usable hit", () => {
		expect(decideStockNameMatch([], GAP)).toEqual({ kind: "none" });
		expect(decideStockNameMatch([{ itemId: "", score: 0.99 }], GAP)).toEqual({
			kind: "none",
		});
	});

	it("asks instead of writing a lone hit below 0.78", () => {
		expect(
			decideStockNameMatch([{ itemId: "rice-flour", score: 0.62 }], GAP),
		).toEqual({
			kind: "disambiguate",
			reason: "below_cook_threshold",
			matches: [{ itemId: "rice-flour", score: 0.62 }],
		});
	});

	it("asks for a hit just under the cook threshold", () => {
		const decision = decideStockNameMatch(
			[{ itemId: "oil", score: STOCK_NAME_MATCH_THRESHOLD - 0.001 }],
			GAP,
		);
		expect(decision.kind).toBe("disambiguate");
		if (decision.kind !== "disambiguate") return;
		expect(decision.reason).toBe("below_cook_threshold");
	});

	it("uses a lone hit exactly at the cook threshold", () => {
		expect(
			decideStockNameMatch(
				[{ itemId: "oats", score: STOCK_NAME_MATCH_THRESHOLD }],
				GAP,
			),
		).toEqual({ kind: "use", itemId: "oats" });
	});

	it("uses a clear top hit and ignores a weak runner-up", () => {
		expect(
			decideStockNameMatch(
				[
					{ itemId: "weak", score: 0.62 },
					{ itemId: "grapes", score: 0.91 },
				],
				GAP,
			),
		).toEqual({ kind: "use", itemId: "grapes" });
	});

	it("asks when two strong hits are within the score gap", () => {
		expect(
			decideStockNameMatch(
				[
					{ itemId: "tuna-oil", score: 0.9 },
					{ itemId: "tuna-water", score: 0.85 },
				],
				GAP,
			),
		).toEqual({
			kind: "disambiguate",
			reason: "close_scores",
			matches: [
				{ itemId: "tuna-oil", score: 0.9 },
				{ itemId: "tuna-water", score: 0.85 },
			],
		});
	});

	it("marks cookMatch only at the cook threshold", () => {
		expect(cookMatchForScore(0.62)).toBe(false);
		expect(cookMatchForScore(STOCK_NAME_MATCH_THRESHOLD)).toBe(true);
		expect(cookMatchForScore(1)).toBe(true);
	});

	it("tells the caller that a weak match changed nothing", () => {
		const note = stockNameDisambiguationNote(
			"rice",
			"below_cook_threshold",
			"retry adjust_cargo_item with that itemId",
		);
		expect(note).toContain("0.78");
		expect(note).toContain("Nothing was changed");
		expect(note).toContain("retry adjust_cargo_item with that itemId");
	});
});
