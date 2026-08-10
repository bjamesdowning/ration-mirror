import { describe, expect, it } from "vitest";
import {
	NUTRITION_DATASET_SNAPSHOT_ID,
	NUTRITION_MATCHER_VERSION,
	nutritionMatchCacheKey,
	nutritionPortionCacheKey,
} from "../constants";

describe("nutritionMatchCacheKey", () => {
	it("includes snapshot id, matcher version, and name hash", () => {
		const key = nutritionMatchCacheKey("abc123hash");
		expect(key).toContain(NUTRITION_DATASET_SNAPSHOT_ID);
		expect(key).toContain(NUTRITION_MATCHER_VERSION);
		expect(NUTRITION_MATCHER_VERSION).toBe("1.4.0");
		expect(key).toContain("abc123hash");
		expect(key.startsWith("nutrition:match:")).toBe(true);
	});
});

describe("nutritionPortionCacheKey", () => {
	it("versions portion lookups by snapshot and matcher", () => {
		const key = nutritionPortionCacheKey(171705, "unit", "hint");
		expect(key).toContain("nutrition:portion:");
		expect(key).toContain("171705");
	});
});
