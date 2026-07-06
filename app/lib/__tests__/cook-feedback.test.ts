import { describe, expect, it } from "vitest";
import {
	cookDeductionNote,
	galleyPartialCookDescription,
	manifestConsumeNote,
} from "../cook-feedback";

describe("cook-feedback", () => {
	it("describes partial cook with deductions", () => {
		expect(
			cookDeductionNote({
				partialCook: true,
				deductionCount: 1,
				skippedIngredients: [{ name: "eggs" }],
			}),
		).toContain("Skipped (insufficient stock): eggs");
	});

	it("describes partial cook with no deductions", () => {
		expect(
			cookDeductionNote({
				partialCook: true,
				deductionCount: 0,
				skippedIngredients: [{ name: "eggs" }, { name: "milk" }],
			}),
		).toContain("eggs, milk");
	});

	it("describes full cook", () => {
		expect(
			cookDeductionNote({
				partialCook: false,
				deductionCount: 2,
			}),
		).toBe("Ingredients have been deducted from your pantry inventory.");
	});

	it("describes partial manifest consume", () => {
		expect(
			manifestConsumeNote({
				consumed: 2,
				partialCook: true,
				deductionCount: 1,
				skippedIngredients: [{ name: "eggs" }],
			}),
		).toContain("2 entries");
		expect(
			manifestConsumeNote({
				consumed: 1,
				partialCook: true,
				deductionCount: 1,
				skippedIngredients: [{ name: "eggs" }],
			}),
		).toContain("1 entry");
	});

	it("formats galley partial description with skipped names", () => {
		expect(
			galleyPartialCookDescription([{ name: "broccoli" }, { name: "eggs" }]),
		).toBe("Available ingredients deducted. Skipped: broccoli, eggs.");
	});
});
