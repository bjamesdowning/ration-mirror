import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatSnoozeTimeLeft, toTitleCase } from "~/lib/format-display";

describe("toTitleCase", () => {
	it("capitalises first letter of each word", () => {
		expect(toTitleCase("olive oil")).toBe("Olive Oil");
	});

	it("handles single word", () => {
		expect(toTitleCase("tomato")).toBe("Tomato");
	});

	it("handles already-capitalised input", () => {
		expect(toTitleCase("Olive Oil")).toBe("Olive Oil");
	});

	it("handles empty string", () => {
		expect(toTitleCase("")).toBe("");
	});

	it("handles multiple spaces gracefully", () => {
		expect(toTitleCase("sea  salt")).toBe("Sea  Salt");
	});
});

describe("formatSnoozeTimeLeft", () => {
	const NOW = new Date("2025-06-15T12:00:00Z");

	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(NOW);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("returns 'Expired' when snooze is in the past", () => {
		const past = new Date("2025-06-15T11:00:00Z");
		expect(formatSnoozeTimeLeft(past)).toBe("Expired");
	});

	it("returns 'Expired' when snooze is exactly now", () => {
		expect(formatSnoozeTimeLeft(NOW)).toBe("Expired");
	});

	it("returns 'Expires soon' when < 1 hour remains", () => {
		const soon = new Date("2025-06-15T12:30:00Z");
		expect(formatSnoozeTimeLeft(soon)).toBe("Expires soon");
	});

	it("returns hours left when 1-23 hours remain", () => {
		const sixHours = new Date("2025-06-15T18:00:00Z");
		expect(formatSnoozeTimeLeft(sixHours)).toBe("6h left");
	});

	it("returns singular 'day' when exactly 1 day remains", () => {
		const tomorrow = new Date("2025-06-16T12:00:00Z");
		expect(formatSnoozeTimeLeft(tomorrow)).toBe("1 day left");
	});

	it("returns plural 'days' when > 1 day remains", () => {
		const twoDays = new Date("2025-06-17T12:00:00Z");
		expect(formatSnoozeTimeLeft(twoDays)).toBe("2 days left");
	});

	it("returns days for multi-day snooze", () => {
		const week = new Date("2025-06-22T12:00:00Z");
		expect(formatSnoozeTimeLeft(week)).toBe("7 days left");
	});
});
