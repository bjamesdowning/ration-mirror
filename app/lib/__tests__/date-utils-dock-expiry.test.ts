import { describe, expect, it } from "vitest";
import { parseDockExpiresAt, toExpiryDate } from "~/lib/date-utils";

describe("parseDockExpiresAt", () => {
	it("parses yyyy-MM-dd as UTC midnight (not unix year)", () => {
		const d = parseDockExpiresAt("2026-07-17");
		expect(d).not.toBeNull();
		expect(d?.toISOString().startsWith("2026-07-17")).toBe(true);
	});

	it("does not corrupt calendar dates the way toExpiryDate does", () => {
		const broken = toExpiryDate("2026-07-17");
		expect(broken?.getUTCFullYear()).toBe(1970);
		const fixed = parseDockExpiresAt("2026-07-17");
		expect(fixed?.getUTCFullYear()).toBe(2026);
	});

	it("parses ISO datetime strings", () => {
		const d = parseDockExpiresAt("2026-07-17T12:00:00.000Z");
		expect(d?.toISOString()).toBe("2026-07-17T12:00:00.000Z");
	});
});
