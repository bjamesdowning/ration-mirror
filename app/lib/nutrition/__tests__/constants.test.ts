import { describe, expect, it } from "vitest";
import {
	NUTRITION_MATCHER_VERSION,
	nutritionMatchCacheKey,
} from "../constants";

describe("nutritionMatchCacheKey", () => {
	it("includes matcher version for KV busting", () => {
		const key = nutritionMatchCacheKey("whole milk");
		expect(key).toContain(NUTRITION_MATCHER_VERSION);
		expect(key).toContain("whole milk");
	});
});
