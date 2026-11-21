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

	it("keeps photo food log off until it is switched on", () => {
		expect(FLAG_REGISTRY["nutrition-photo-log"].defaultEnabled).toBe(false);
		expect(FLAG_REGISTRY["nutrition-photo-log"].iosAlwaysOn).toBe(false);
	});

	it("keeps the Copilot confirm and recovery flags off and server-only", () => {
		for (const key of [
			"copilot-confirm-scope",
			"copilot-recovery-tuning",
		] as const) {
			expect(FLAG_REGISTRY[key].defaultEnabled).toBe(false);
			expect(FLAG_REGISTRY[key].iosAlwaysOn).toBe(false);
			expect(FLAG_REGISTRY[key].clientVisible).toBe(false);
		}
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
			"cargo-embedding-gemma-2",
			"copilot-confirm-scope",
			"copilot-recovery-tuning",
			"nutrition-async-recompute",
			"nutrition-barcode-diary",
			"nutrition-fast-log",
			"nutrition-fuel-page",
			"nutrition-health-export",
			"nutrition-photo-log",
			"nutrition-saved-food",
			"plan-fuel-actions",
			"share-extension-import",
		]);
	});
});
