import { describe, expect, it } from "vitest";
import { FUEL_DAILY_LIMIT } from "~/lib/nutrition/fuel-errors";
import {
	CREW_FUEL_LOGS_LABEL,
	FREE_FUEL_LOGS_LABEL,
	FUEL_LOGS_ROW_LABEL,
	UNLIMITED_FUEL_LOGS,
} from "../crew-fuel-copy";

describe("crew fuel copy", () => {
	it("uses one phrase for the Crew bullet", () => {
		expect(UNLIMITED_FUEL_LOGS).toBe("Unlimited Fuel logs");
	});

	it("keeps Free at the daily gate and Crew unlimited", () => {
		expect(FUEL_LOGS_ROW_LABEL).toBe("Fuel logs");
		expect(FREE_FUEL_LOGS_LABEL).toBe(String(FUEL_DAILY_LIMIT));
		expect(FREE_FUEL_LOGS_LABEL).toBe("3");
		expect(CREW_FUEL_LOGS_LABEL).toBe("Unlimited");
	});
});
