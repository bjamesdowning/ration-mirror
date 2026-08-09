import { describe, expect, it } from "vitest";
import {
	decodeNutritionIntakeCursor,
	encodeNutritionIntakeCursor,
} from "../persist.server";

describe("nutrition intake cursor", () => {
	it("round-trips manifestDate|occurredAt|id", () => {
		const occurredAt = new Date("2026-08-09T12:30:00.000Z");
		const encoded = encodeNutritionIntakeCursor(
			"2026-08-09",
			occurredAt,
			"abc-123",
		);
		const decoded = decodeNutritionIntakeCursor(encoded);
		expect(decoded).toEqual({
			manifestDate: "2026-08-09",
			occurredAt,
			id: "abc-123",
		});
	});

	it("rejects malformed cursors", () => {
		expect(decodeNutritionIntakeCursor("not-a-cursor")).toBeNull();
		expect(decodeNutritionIntakeCursor("2026-08-09|bad-date|id")).toBeNull();
	});
});
