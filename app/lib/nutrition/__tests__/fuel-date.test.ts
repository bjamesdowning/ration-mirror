import { describe, expect, it } from "vitest";
import { FuelTimezoneRequiredError } from "../fuel-errors";
import {
	fuelDateForInstant,
	isCalendarDate,
	noonOnFuelDate,
} from "../fuel-date";

describe("noonOnFuelDate", () => {
	it("keeps local noon on the chosen day", () => {
		for (const zone of [
			"Europe/Dublin",
			"America/Los_Angeles",
			"Pacific/Kiritimati",
		]) {
			const noon = noonOnFuelDate("2026-11-01", zone);
			expect(fuelDateForInstant(noon, zone)).toBe("2026-11-01");
		}
	});

	it("rejects a day that is not on the calendar", () => {
		expect(isCalendarDate("2026-11-01")).toBe(true);
		expect(isCalendarDate("2026-02-31")).toBe(false);
		expect(() => noonOnFuelDate("2026-02-31", "Europe/Dublin")).toThrow(
			FuelTimezoneRequiredError,
		);
	});
});
