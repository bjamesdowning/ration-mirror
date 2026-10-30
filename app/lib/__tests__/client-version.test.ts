import { describe, expect, it } from "vitest";
import { compareVersions, isVersionAtLeast } from "../client-version";

describe("compareVersions", () => {
	it("orders numerically, not lexically", () => {
		expect(compareVersions("1.5.11", "1.5.2")).toBe(1);
		expect(compareVersions("1.4.31", "1.5.0")).toBe(-1);
		expect(compareVersions("1.10", "1.9.9")).toBe(1);
	});

	it("treats missing parts as zero", () => {
		expect(compareVersions("1.5", "1.5.0")).toBe(0);
		expect(compareVersions("2", "1.99.99")).toBe(1);
	});

	it("returns null for non-numeric versions", () => {
		expect(compareVersions("unknown", "1.5.0")).toBeNull();
		expect(compareVersions("1.5.0-beta", "1.5.0")).toBeNull();
		expect(compareVersions("", "1.5.0")).toBeNull();
	});
});

describe("isVersionAtLeast", () => {
	it("is false for missing or unparsable versions", () => {
		expect(isVersionAtLeast(undefined, "1.5.0")).toBe(false);
		expect(isVersionAtLeast("unknown", "1.5.0")).toBe(false);
	});

	it("includes the floor itself", () => {
		expect(isVersionAtLeast("1.5.0", "1.5.0")).toBe(true);
		expect(isVersionAtLeast("1.4.31", "1.5.0")).toBe(false);
	});
});
