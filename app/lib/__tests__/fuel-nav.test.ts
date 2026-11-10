import { describe, expect, it } from "vitest";
import { fuelNavItems } from "~/lib/shell/fuel-nav";

describe("fuel navigation", () => {
	it("keeps five items when the flag is off", () => {
		const nav = fuelNavItems(false);
		expect(nav.rail.map((item) => item.label)).toEqual([
			"Hub",
			"Cargo",
			"Galley",
			"Manifest",
			"Supply",
		]);
		expect(nav.bottom).toEqual(nav.rail);
	});

	it("gives the rail six items and replaces Hub on the phone", () => {
		const nav = fuelNavItems(true);
		expect(nav.rail.map((item) => item.label)).toEqual([
			"Hub",
			"Fuel",
			"Cargo",
			"Galley",
			"Manifest",
			"Supply",
		]);
		expect(nav.bottom.map((item) => item.label)).toEqual([
			"Fuel",
			"Cargo",
			"Galley",
			"Manifest",
			"Supply",
		]);
		expect(nav.bottom).toHaveLength(5);
		expect(nav.rail[1]?.to).toBe("/hub/fuel");
	});
});
