import { describe, expect, it } from "vitest";
import {
	CREW_PAYWALL_HREF,
	isSupplyListCapacityError,
} from "../supply-list-capacity-gate";

describe("supply list capacity gate", () => {
	it("sends the quota error to the same paywall as Fuel", () => {
		expect(CREW_PAYWALL_HREF).toBe("/hub/pricing");
		expect(
			isSupplyListCapacityError(
				new Error("capacity_exceeded:supplyLists:3:3"),
			),
		).toBe(true);
		expect(isSupplyListCapacityError(new Error("capacity_exceeded"))).toBe(
			true,
		);
	});

	it("leaves other failures alone", () => {
		expect(
			isSupplyListCapacityError(new Error("Give the list a name.")),
		).toBe(false);
		expect(isSupplyListCapacityError("capacity_exceeded")).toBe(false);
	});
});
