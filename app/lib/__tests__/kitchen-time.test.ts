import { describe, expect, it } from "vitest";
import {
	formatISODateInTimeZone,
	isValidIanaTimeZone,
	kitchenTodayISO,
	resolveKitchenTimeZone,
} from "../kitchen-time";

describe("kitchen time zone", () => {
	it("accepts IANA names and rejects offsets and abbreviations", () => {
		expect(isValidIanaTimeZone("America/Los_Angeles")).toBe(true);
		expect(isValidIanaTimeZone("Europe/Dublin")).toBe(true);
		expect(isValidIanaTimeZone("UTC")).toBe(true);
		expect(isValidIanaTimeZone("PST")).toBe(false);
		expect(isValidIanaTimeZone("GMT-7")).toBe(false);
		expect(isValidIanaTimeZone("UTC+1")).toBe(false);
		expect(isValidIanaTimeZone("")).toBe(false);
	});

	it("reads the zone from supply settings and ignores an invalid stored value", () => {
		expect(
			resolveKitchenTimeZone({
				supplySettings: { timeZone: "Europe/Dublin" },
			}),
		).toBe("Europe/Dublin");
		expect(
			resolveKitchenTimeZone({
				supplySettings: { timeZone: "PST" },
			}),
		).toBeNull();
		expect(resolveKitchenTimeZone(null)).toBeNull();
		expect(resolveKitchenTimeZone({})).toBeNull();
	});

	it("keeps UTC when the kitchen has no zone", () => {
		const now = new Date("2026-07-13T23:30:00.000Z");
		expect(kitchenTodayISO(null, now)).toBe("2026-07-13");
		expect(kitchenTodayISO({ supplySettings: {} }, now)).toBe("2026-07-13");
		expect(
			kitchenTodayISO({ supplySettings: { timeZone: "Not/AZone" } }, now),
		).toBe("2026-07-13");
	});

	it("crosses local midnight in Ireland in summer", () => {
		const metadata = { supplySettings: { timeZone: "Europe/Dublin" } };
		expect(
			kitchenTodayISO(metadata, new Date("2026-07-13T22:30:00.000Z")),
		).toBe("2026-07-13");
		expect(
			kitchenTodayISO(metadata, new Date("2026-07-13T23:30:00.000Z")),
		).toBe("2026-07-14");
	});

	it("crosses local midnight on US Pacific time", () => {
		const metadata = { supplySettings: { timeZone: "America/Los_Angeles" } };
		expect(
			kitchenTodayISO(metadata, new Date("2026-07-14T06:30:00.000Z")),
		).toBe("2026-07-13");
		expect(
			kitchenTodayISO(metadata, new Date("2026-07-14T07:30:00.000Z")),
		).toBe("2026-07-14");
	});

	it("keeps the calendar day across the US spring-forward gap", () => {
		const zone = "America/Los_Angeles";
		expect(
			formatISODateInTimeZone(new Date("2026-03-08T09:30:00.000Z"), zone),
		).toBe("2026-03-08");
		expect(
			formatISODateInTimeZone(new Date("2026-03-08T10:30:00.000Z"), zone),
		).toBe("2026-03-08");
		expect(
			formatISODateInTimeZone(new Date("2026-03-08T07:59:00.000Z"), zone),
		).toBe("2026-03-07");
		expect(
			formatISODateInTimeZone(new Date("2026-03-08T08:00:00.000Z"), zone),
		).toBe("2026-03-08");
	});

	it("keeps the calendar day across the US fall-back hour", () => {
		const zone = "America/Los_Angeles";
		expect(
			formatISODateInTimeZone(new Date("2026-11-01T06:59:00.000Z"), zone),
		).toBe("2026-10-31");
		expect(
			formatISODateInTimeZone(new Date("2026-11-01T07:00:00.000Z"), zone),
		).toBe("2026-11-01");
		expect(
			formatISODateInTimeZone(new Date("2026-11-01T08:30:00.000Z"), zone),
		).toBe("2026-11-01");
		expect(
			formatISODateInTimeZone(new Date("2026-11-01T09:30:00.000Z"), zone),
		).toBe("2026-11-01");
	});
});
