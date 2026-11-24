import { describe, expect, it } from "vitest";
import {
	presentFuelSave,
	presentManifestIntakeSave,
} from "~/lib/nutrition/fuel-save-presentation";

describe("fuel save presentation", () => {
	it("maps the server daily limit to Crew and no other code", () => {
		expect(presentFuelSave("fuel_daily_limit")).toBe("paywall");
		expect(presentFuelSave("fuel_timezone_required")).toBe("message");
		expect(presentFuelSave("invalid_request")).toBe("message");
		expect(presentFuelSave(undefined)).toBe("message");
		expect(presentFuelSave(null)).toBe("message");
	});
});

describe("manifest plate-up save presentation", () => {
	it("opens Crew only for the daily limit and keeps a successful save", () => {
		expect(
			presentManifestIntakeSave({
				error: "Daily Fuel limit reached",
				code: "fuel_daily_limit",
			}),
		).toBe("paywall");
		expect(
			presentManifestIntakeSave({
				intake: { id: "logged" },
				code: "fuel_daily_limit",
			}),
		).toBe("saved");
		expect(presentManifestIntakeSave({ cleared: true })).toBe("cleared");
		expect(
			presentManifestIntakeSave({
				error: "Invalid request",
				code: "invalid_request",
			}),
		).toBe("message");
		expect(
			presentManifestIntakeSave({
				error: "Nutrition unavailable for this meal.",
				code: "nutrition_unavailable",
			}),
		).toBe("message");
		expect(presentManifestIntakeSave({})).toBe("idle");
		expect(presentManifestIntakeSave(null)).toBe("idle");
		expect(presentManifestIntakeSave(undefined)).toBe("idle");
	});
});
