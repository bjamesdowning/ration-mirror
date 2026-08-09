import { describe, expect, it } from "vitest";
import {
	inferSlotTypeFromLocalHour,
	resolveManifestSlotType,
} from "~/lib/manifest-slot";

describe("inferSlotTypeFromLocalHour", () => {
	it("maps morning to breakfast", () => {
		expect(inferSlotTypeFromLocalHour(5)).toBe("breakfast");
		expect(inferSlotTypeFromLocalHour(9)).toBe("breakfast");
	});

	it("maps midday to lunch", () => {
		expect(inferSlotTypeFromLocalHour(10)).toBe("lunch");
		expect(inferSlotTypeFromLocalHour(14)).toBe("lunch");
	});

	it("maps afternoon/evening to dinner", () => {
		expect(inferSlotTypeFromLocalHour(15)).toBe("dinner");
		expect(inferSlotTypeFromLocalHour(20)).toBe("dinner");
	});

	it("maps late night / early morning to snack", () => {
		expect(inferSlotTypeFromLocalHour(21)).toBe("snack");
		expect(inferSlotTypeFromLocalHour(0)).toBe("snack");
		expect(inferSlotTypeFromLocalHour(4)).toBe("snack");
	});

	it("clamps invalid hours", () => {
		expect(inferSlotTypeFromLocalHour(-1)).toBe("snack");
		expect(inferSlotTypeFromLocalHour(99)).toBe("snack");
	});
});

describe("resolveManifestSlotType", () => {
	it("prefers explicit slotType", () => {
		expect(
			resolveManifestSlotType({ slotType: "breakfast", localHour: 20 }),
		).toBe("breakfast");
	});

	it("infers from localHour when slot omitted", () => {
		expect(resolveManifestSlotType({ localHour: 12 })).toBe("lunch");
	});

	it("defaults to dinner", () => {
		expect(resolveManifestSlotType({})).toBe("dinner");
	});
});
