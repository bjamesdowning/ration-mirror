import { describe, expect, it } from "vitest";
import { CARGO_STATUS_LABELS, formatCargoStatus, formatTag } from "~/lib/cargo";

describe("formatCargoStatus", () => {
	it("returns STABLE label for 'stable'", () => {
		expect(formatCargoStatus("stable")).toBe("STABLE");
	});

	it("returns DECAY IMMINENT label for 'decay_imminent'", () => {
		expect(formatCargoStatus("decay_imminent")).toBe("DECAY IMMINENT");
	});

	it("returns BIOHAZARD label for 'biohazard'", () => {
		expect(formatCargoStatus("biohazard")).toBe("BIOHAZARD");
	});

	it("returns stable label for undefined", () => {
		expect(formatCargoStatus(undefined)).toBe(CARGO_STATUS_LABELS.stable);
	});

	it("returns stable label for null", () => {
		expect(formatCargoStatus(null)).toBe(CARGO_STATUS_LABELS.stable);
	});

	it("formats unknown status by replacing underscores and uppercasing", () => {
		expect(formatCargoStatus("custom_status")).toBe("CUSTOM STATUS");
	});
});

describe("formatTag", () => {
	it("capitalises first letter", () => {
		expect(formatTag("organic")).toBe("Organic");
		expect(formatTag("gluten-free")).toBe("Gluten-free");
	});

	it("handles already-capitalised tags", () => {
		expect(formatTag("Organic")).toBe("Organic");
	});

	it("handles single character", () => {
		expect(formatTag("a")).toBe("A");
	});

	it("handles empty string gracefully", () => {
		expect(formatTag("")).toBe("");
	});
});
