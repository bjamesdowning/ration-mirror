import { describe, expect, it } from "vitest";
import { assertRegistryDefaults, isValidFlagKey } from "../registry";

describe("FLAG_REGISTRY validation", () => {
	it("ships with valid defaults for every entry", () => {
		expect(() => assertRegistryDefaults()).not.toThrow();
	});

	it("validates kebab-case flag keys", () => {
		expect(isValidFlagKey("apple-web-login")).toBe(true);
		expect(isValidFlagKey("new-checkout")).toBe(true);
		expect(isValidFlagKey("feature_v2")).toBe(false);
		expect(isValidFlagKey("Bad-Key")).toBe(false);
	});
});
