import { describe, expect, it } from "vitest";
import {
	celsiusToFahrenheit,
	fahrenheitToCelsius,
	lookupOvenTemperature,
} from "../oven-temperature";

describe("lookupOvenTemperature", () => {
	it("maps 180°C to 160°C fan, 350°F and gas 4", () => {
		const hit = lookupOvenTemperature(180, "c");
		expect(hit?.exact).toBe(true);
		expect(hit?.row).toMatchObject({ fan: 160, f: 350, gas: 4 });
	});

	it("works from every scale", () => {
		expect(lookupOvenTemperature(350, "f")?.row.c).toBe(180);
		expect(lookupOvenTemperature(160, "fan")?.row.c).toBe(180);
		expect(lookupOvenTemperature(4, "gas")?.row.c).toBe(180);
		expect(lookupOvenTemperature(0.5, "gas")?.row.f).toBe(250);
		expect(lookupOvenTemperature(0.5, "gas")?.row.gasLabel).toBe("1/2");
		expect(lookupOvenTemperature(0.25, "gas")?.row.gasLabel).toBe("1/4");
	});

	it("snaps near values and flags them as approximate", () => {
		const hit = lookupOvenTemperature(356, "f");
		expect(hit?.row.c).toBe(180);
		expect(hit?.exact).toBe(false);
	});

	it("returns null outside the oven chart", () => {
		expect(lookupOvenTemperature(20, "c")).toBeNull();
		expect(lookupOvenTemperature(12, "gas")).toBeNull();
	});
});

describe("exact temperature formulas", () => {
	it("converts between °C and °F", () => {
		expect(celsiusToFahrenheit(100)).toBe(212);
		expect(fahrenheitToCelsius(32)).toBe(0);
		expect(celsiusToFahrenheit(180)).toBe(356);
	});
});
