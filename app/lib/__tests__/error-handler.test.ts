import { describe, expect, it } from "vitest";
import { getEffectiveTier } from "~/lib/capacity.server";
import { isD1ContentionError } from "~/lib/error-handler";

const NOW = new Date("2025-06-15T12:00:00Z");

// ---------------------------------------------------------------------------
// isD1ContentionError
// ---------------------------------------------------------------------------

describe("isD1ContentionError", () => {
	it("returns false for non-Error values", () => {
		expect(isD1ContentionError("string error")).toBe(false);
		expect(isD1ContentionError(null)).toBe(false);
		expect(isD1ContentionError(undefined)).toBe(false);
		expect(isD1ContentionError(42)).toBe(false);
	});

	it("returns true for D1_ERROR pattern", () => {
		expect(isD1ContentionError(new Error("D1_ERROR: some db error"))).toBe(
			true,
		);
	});

	it("returns true for SQLITE_BUSY pattern", () => {
		expect(
			isD1ContentionError(new Error("SQLITE_BUSY: database is busy")),
		).toBe(true);
	});

	it("returns true for 'database is locked' pattern", () => {
		expect(isD1ContentionError(new Error("database is locked"))).toBe(true);
	});

	it("returns true for 'too many connections' pattern", () => {
		expect(
			isD1ContentionError(new Error("too many connections exceeded")),
		).toBe(true);
	});

	it("returns true for 'timeout' pattern", () => {
		expect(isD1ContentionError(new Error("query timeout after 30s"))).toBe(
			true,
		);
	});

	it("returns true for 'worker exceeded' pattern", () => {
		expect(isD1ContentionError(new Error("worker exceeded memory limit"))).toBe(
			true,
		);
	});

	it("returns true for '522' HTTP error code", () => {
		expect(isD1ContentionError(new Error("522 connection timed out"))).toBe(
			true,
		);
	});

	it("returns true for '524' HTTP error code", () => {
		expect(isD1ContentionError(new Error("524 a timeout occurred"))).toBe(true);
	});

	it("returns true for SQLITE_RANGE (too many bound parameters)", () => {
		expect(
			isD1ContentionError(
				new Error("SQLITE_RANGE: bind or column index out of range"),
			),
		).toBe(true);
	});

	it("returns true for 'too many bound parameters' phrase", () => {
		expect(
			isD1ContentionError(new Error("too many bound parameters: 168 > 100")),
		).toBe(true);
	});

	it("is case-insensitive", () => {
		expect(isD1ContentionError(new Error("DATABASE IS LOCKED"))).toBe(true);
		expect(isD1ContentionError(new Error("SQLITE_BUSY"))).toBe(true);
	});

	it("returns false for unrelated errors", () => {
		expect(
			isD1ContentionError(new Error("Cannot read property of undefined")),
		).toBe(false);
		expect(isD1ContentionError(new Error("fetch failed"))).toBe(false);
		expect(isD1ContentionError(new Error("404 not found"))).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// getEffectiveTier
// ---------------------------------------------------------------------------

describe("getEffectiveTier", () => {
	it("returns crew_member tier when not expired", () => {
		const futureExpiry = new Date("2026-01-01T00:00:00Z");
		const result = getEffectiveTier("crew_member", futureExpiry, NOW);
		expect(result.tier).toBe("crew_member");
		expect(result.isExpired).toBe(false);
	});

	it("falls back to free tier when crew_member subscription has expired", () => {
		const pastExpiry = new Date("2025-01-01T00:00:00Z"); // Before NOW
		const result = getEffectiveTier("crew_member", pastExpiry, NOW);
		expect(result.tier).toBe("free");
		expect(result.isExpired).toBe(true);
	});

	it("handles expiry exactly at now (expired)", () => {
		// expiresAt.getTime() <= now.getTime() → expired
		const result = getEffectiveTier("crew_member", NOW, NOW);
		expect(result.tier).toBe("free");
		expect(result.isExpired).toBe(true);
	});

	it("returns free tier for free users regardless of expiry", () => {
		const result = getEffectiveTier("free", null, NOW);
		expect(result.tier).toBe("free");
		expect(result.isExpired).toBe(false);
	});

	it("returns free tier when crew_member has no expiry date (null → not expired)", () => {
		// No expiry = subscription doesn't expire
		const result = getEffectiveTier("crew_member", null, NOW);
		expect(result.tier).toBe("crew_member");
		expect(result.isExpired).toBe(false);
	});

	it("accepts Unix seconds timestamp as expiry", () => {
		// Unix seconds for 2026-01-01 = 1767225600 (< 1e12 so treated as seconds)
		const futureSeconds = Math.floor(
			new Date("2026-01-01T00:00:00Z").getTime() / 1000,
		);
		const result = getEffectiveTier("crew_member", futureSeconds, NOW);
		expect(result.tier).toBe("crew_member");
		expect(result.isExpired).toBe(false);
	});

	it("accepts Unix milliseconds timestamp as expiry", () => {
		const futureMs = new Date("2026-01-01T00:00:00Z").getTime(); // > 1e12
		const result = getEffectiveTier("crew_member", futureMs, NOW);
		expect(result.tier).toBe("crew_member");
		expect(result.isExpired).toBe(false);
	});

	it("uses current time when now is omitted (smoke test)", () => {
		const distantFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
		const result = getEffectiveTier("crew_member", distantFuture);
		expect(result.tier).toBe("crew_member");
	});
});
