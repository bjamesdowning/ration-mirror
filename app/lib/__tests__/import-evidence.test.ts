import { describe, expect, it } from "vitest";
import {
	countMissingIngredientAmounts,
	importEvidenceSummary,
	parseImportEvidence,
	serializeImportEvidence,
} from "~/lib/import/import-evidence";

describe("importEvidenceSummary", () => {
	it("maps keys to user-facing labels and dedupes caption sources", () => {
		expect(
			importEvidenceSummary([
				"oembed",
				"user_text",
				"transcript_asr",
				"json_ld",
			]),
		).toEqual(["From caption", "From spoken audio", "From recipe card"]);
	});

	it("returns empty for missing evidence", () => {
		expect(importEvidenceSummary(undefined)).toEqual([]);
		expect(importEvidenceSummary([])).toEqual([]);
	});
});

describe("serializeImportEvidence / parseImportEvidence", () => {
	it("round-trips comma-separated keys", () => {
		const raw = serializeImportEvidence(["oembed", "transcript_asr"]);
		expect(raw).toBe("oembed,transcript_asr");
		expect(parseImportEvidence(raw)).toEqual(["oembed", "transcript_asr"]);
	});
});

describe("countMissingIngredientAmounts", () => {
	it("counts zero quantity and unit placeholders", () => {
		expect(
			countMissingIngredientAmounts([
				{ quantity: 200, unit: "g" },
				{ quantity: 0, unit: "unit" },
				{ quantity: 1, unit: "" },
			]),
		).toBe(2);
	});
});
