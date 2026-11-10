import { describe, expect, it } from "vitest";
import {
	assertFuelDateUnchanged,
	fuelDateForInstant,
} from "~/lib/nutrition/fuel-date";
import { FuelDateImmutableError } from "~/lib/nutrition/fuel-errors";

describe("fuel dates in Europe/Dublin", () => {
	it("keeps the calendar day across the spring-forward gap", () => {
		const before = fuelDateForInstant(
			new Date("2026-03-29T00:30:00Z"),
			"Europe/Dublin",
		);
		const after = fuelDateForInstant(
			new Date("2026-03-29T01:30:00Z"),
			"Europe/Dublin",
		);
		expect(before).toBe("2026-03-29");
		expect(after).toBe("2026-03-29");
	});

	it("keeps the repeated hour on the fall-back day", () => {
		const first = fuelDateForInstant(
			new Date("2026-10-25T00:30:00Z"),
			"Europe/Dublin",
		);
		const second = fuelDateForInstant(
			new Date("2026-10-25T01:30:00Z"),
			"Europe/Dublin",
		);
		expect(first).toBe("2026-10-25");
		expect(second).toBe("2026-10-25");
	});

	it("does not rewrite a stored day when the zone would stamp a different date", () => {
		expect(() =>
			assertFuelDateUnchanged(
				"2026-03-28",
				new Date("2026-03-29T12:00:00Z"),
				"Europe/Dublin",
			),
		).toThrow(FuelDateImmutableError);
		expect(
			assertFuelDateUnchanged(
				"2026-03-29",
				new Date("2026-03-29T12:00:00Z"),
				"Europe/Dublin",
			),
		).toBe("2026-03-29");
	});
});
