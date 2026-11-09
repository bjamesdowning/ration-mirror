import { describe, expect, it } from "vitest";
import { subjectSkipsExternalFoodApi } from "../food-log-cost";
import {
	diaryCompositionStamp,
	healthExportAllowed,
} from "../health-exportability";

const confirmed = new Date("2026-08-01T12:00:00.000Z");

describe("health export predicate", () => {
	it("fails an AI line even when a timestamp is present", () => {
		expect(
			healthExportAllowed({
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
				healthExportAllowed({
					compositionSource,
					compositionConfirmedAt: confirmed,
				}),
			).toBe(true);
			expect(
				healthExportAllowed({
					compositionSource,
					compositionConfirmedAt: null,
				}),
			).toBe(false);
		}
	});

	it("fails a meal line", () => {
		expect(
			healthExportAllowed({
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
