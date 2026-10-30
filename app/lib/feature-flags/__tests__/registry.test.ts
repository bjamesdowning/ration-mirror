import { describe, expect, it } from "vitest";
import {
	assertRegistryDefaults,
	FLAG_REGISTRY,
	isValidFlagKey,
} from "../registry";

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

	it("ships every iOS-facing flag on for iOS 1.5 except web Apple login, review login, and async recompute", () => {
		const notIos = Object.entries(FLAG_REGISTRY)
			.filter(([, entry]) => !entry.iosAlwaysOn)
			.map(([key]) => key)
			.sort();
		expect(notIos).toEqual([
			"app-review-login",
			"apple-web-login",
			"nutrition-async-recompute",
		]);
	});
});
