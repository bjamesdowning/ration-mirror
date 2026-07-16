import { describe, expect, it } from "vitest";
import {
	MEAL_MATCH_CANDIDATE_CAP,
	resolveMealMatchPreLimit,
} from "../matching.server";

describe("MEAL_MATCH_CANDIDATE_CAP / resolveMealMatchPreLimit", () => {
	it("defaults to 200 candidates", () => {
		expect(MEAL_MATCH_CANDIDATE_CAP).toBe(200);
		expect(resolveMealMatchPreLimit(20)).toBe(200);
		expect(resolveMealMatchPreLimit(6)).toBe(200);
	});

	it("never exceeds 200 even if a larger preLimit is requested", () => {
		expect(resolveMealMatchPreLimit(20, 500)).toBe(200);
	});

	it("raises the cap to at least the result limit", () => {
		expect(resolveMealMatchPreLimit(100, 50)).toBe(100);
	});

	it("clamps result limit influence to the candidate cap", () => {
		expect(resolveMealMatchPreLimit(300)).toBe(200);
	});
});
