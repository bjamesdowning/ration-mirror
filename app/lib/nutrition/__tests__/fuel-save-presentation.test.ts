import { describe, expect, it } from "vitest";
import { presentFuelSave } from "~/lib/nutrition/fuel-save-presentation";

describe("fuel save presentation", () => {
	it("maps the server daily limit to Crew and no other code", () => {
		expect(presentFuelSave("fuel_daily_limit")).toBe("paywall");
		expect(presentFuelSave("fuel_timezone_required")).toBe("message");
		expect(presentFuelSave("invalid_request")).toBe("message");
		expect(presentFuelSave(undefined)).toBe("message");
		expect(presentFuelSave(null)).toBe("message");
	});
});
