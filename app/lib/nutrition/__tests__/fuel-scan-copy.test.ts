import { describe, expect, it } from "vitest";
import {
	FUEL_SCAN_ANALYZING,
	FUEL_SCAN_ANALYZING_DETAIL,
	FUEL_SCAN_NEXT_STEPS,
	FUEL_SCAN_NOT_MEDICAL,
} from "../fuel-scan-copy";

describe("fuel scan copy", () => {
	it("uses the new explainer sentence", () => {
		expect(FUEL_SCAN_NEXT_STEPS).toBe(
			"A photo is taken, analyzed by AI, you can edit what it finds, then add it to Fuel.",
		);
	});

	it("keeps not medical advice as its own sentence", () => {
		expect(FUEL_SCAN_NOT_MEDICAL).toBe("Not medical advice.");
		expect(FUEL_SCAN_NOT_MEDICAL).not.toBe(FUEL_SCAN_NEXT_STEPS);
		expect(FUEL_SCAN_NEXT_STEPS.includes("Approve is the write")).toBe(false);
	});

	it("keeps the analyzing line off the medical sentence", () => {
		expect(FUEL_SCAN_ANALYZING).toBe("Analyzing");
		expect(FUEL_SCAN_ANALYZING_DETAIL).toBe(
			"This usually takes a few seconds.",
		);
		expect(FUEL_SCAN_ANALYZING_DETAIL).not.toContain(FUEL_SCAN_NOT_MEDICAL);
		expect(FUEL_SCAN_ANALYZING).not.toContain(FUEL_SCAN_NOT_MEDICAL);
	});
});
