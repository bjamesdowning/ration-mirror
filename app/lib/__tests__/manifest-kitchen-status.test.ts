import { describe, expect, it } from "vitest";
import {
	manifestKitchenStatus,
	manifestTimestampIso,
} from "~/lib/agent/manifest-kitchen-status";

describe("manifestKitchenStatus", () => {
	it("is planned when neither timestamp is set", () => {
		expect(manifestKitchenStatus(null, null)).toBe("planned");
		expect(manifestKitchenStatus(undefined, undefined)).toBe("planned");
	});

	it("is cooked from cookedAt, legacy consumedAt, or both", () => {
		const cookedAt = new Date("2026-07-13T17:00:00.000Z");
		const consumedAt = new Date("2026-07-13T18:00:00.000Z");
		expect(manifestKitchenStatus(cookedAt, null)).toBe("cooked");
		expect(manifestKitchenStatus(null, consumedAt)).toBe("cooked");
		expect(manifestKitchenStatus(cookedAt, consumedAt)).toBe("cooked");
		expect(
			manifestKitchenStatus(
				"2026-07-13T17:00:00.000Z",
				"2026-07-13T18:00:00.000Z",
			),
		).toBe("cooked");
	});

	it("serializes timestamps to ISO strings", () => {
		expect(manifestTimestampIso(null)).toBeNull();
		expect(manifestTimestampIso(new Date("2026-07-13T18:00:00.000Z"))).toBe(
			"2026-07-13T18:00:00.000Z",
		);
	});
});
