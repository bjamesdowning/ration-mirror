import { describe, expect, it } from "vitest";
import {
	hasPersonalNutritionPayloadFields,
	redactPersonalNutritionFromPayload,
} from "../kitchen-event-privacy";

describe("kitchen-event-privacy", () => {
	it("detects personal nutrition fields", () => {
		expect(
			hasPersonalNutritionPayloadFields({
				planId: "p1",
				energyKcal: 400,
			}),
		).toBe(true);
		expect(
			hasPersonalNutritionPayloadFields({
				planId: "p1",
				servings: 2,
				deductions: [],
			}),
		).toBe(false);
	});

	it("redacts personal nutrition without dropping logistics fields", () => {
		const redacted = redactPersonalNutritionFromPayload({
			planId: "p1",
			entryIds: ["e1"],
			servings: 2,
			deductions: [{ cargoId: "c1", quantity: 1 }],
			energyKcal: 520,
			portionServings: 1.5,
			manifestDate: "2026-08-01",
			verified: true,
			source: "web",
		});
		expect(redacted).toEqual({
			planId: "p1",
			entryIds: ["e1"],
			servings: 2,
			deductions: [{ cargoId: "c1", quantity: 1 }],
			source: "web",
		});
		expect(hasPersonalNutritionPayloadFields(redacted)).toBe(false);
	});

	it("is idempotent", () => {
		const once = redactPersonalNutritionFromPayload({ energyKcal: 1 });
		expect(redactPersonalNutritionFromPayload(once)).toEqual({});
	});
});
