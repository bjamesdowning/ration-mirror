import { describe, expect, it } from "vitest";
import { subjectSkipsExternalFoodApi } from "../food-log-cost";
import {
	diaryCompositionStamp,
	healthExportAllowed,
	legacyHealthExportAllowed,
} from "../health-exportability";

const confirmed = new Date("2026-08-01T12:00:00.000Z");

describe("legacy health export predicate (iOS 1.6.39/1.6.40)", () => {
	it("fails an AI line even when a timestamp is present", () => {
		expect(
			legacyHealthExportAllowed({
				compositionSource: "ai_estimate",
				compositionConfirmedAt: confirmed,
			}),
		).toBe(false);
		expect(
			diaryCompositionStamp("ai_estimate", confirmed).compositionConfirmedAt,
		).toBeNull();
	});

	it("allows confirmed usda, override, manual, and barcode lines", () => {
		for (const compositionSource of [
			"usda",
			"user_override",
			"manual_macros",
			"barcode",
		]) {
			expect(
				legacyHealthExportAllowed({
					compositionSource,
					compositionConfirmedAt: confirmed,
				}),
			).toBe(true);
			expect(
				legacyHealthExportAllowed({
					compositionSource,
					compositionConfirmedAt: null,
				}),
			).toBe(false);
		}
	});

	it("keeps the older name as the same rule", () => {
		expect(healthExportAllowed).toBe(legacyHealthExportAllowed);
	});

	it("fails a meal line", () => {
		expect(
			legacyHealthExportAllowed({
				compositionSource: "meal",
				compositionConfirmedAt: confirmed,
			}),
		).toBe(false);
	});
});

describe("external food api skip", () => {
	it("keeps meals and loose produce off the catalogue", () => {
		expect(subjectSkipsExternalFoodApi("meal")).toBe(true);
		expect(subjectSkipsExternalFoodApi("loose_produce")).toBe(true);
		expect(subjectSkipsExternalFoodApi("packaged")).toBe(false);
		expect(subjectSkipsExternalFoodApi("custom")).toBe(false);
	});
});
