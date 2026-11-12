import { describe, expect, it } from "vitest";
import { cargoEatPostPath } from "~/lib/nutrition/cargo-eat-route";

const CARGO_ID = "11111111-1111-4111-8111-111111111111";

describe("cargo eat route", () => {
	it("stays on quick-eat when plan-fuel-actions is off", () => {
		expect(cargoEatPostPath(CARGO_ID, false)).toBe(
			`/api/cargo/${CARGO_ID}/quick-eat`,
		);
	});

	it("calls the Fuel route when plan-fuel-actions is on", () => {
		expect(cargoEatPostPath(CARGO_ID, true)).toBe(
			`/api/mobile/v1/cargo/${CARGO_ID}/add-to-fuel`,
		);
	});
});
