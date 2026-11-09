import { describe, expect, it, vi } from "vitest";
import { isFeatureEnabled } from "~/lib/feature-flags/flags.server";
import {
	isNutritionFastLogEnabled,
	NUTRITION_FAST_LOG_IOS_MIN,
	nutritionFastLogClientAllowed,
} from "../fast-log-flag.server";

vi.mock("~/lib/feature-flags/flags.server", () => ({
	isFeatureEnabled: vi.fn(),
}));

describe("nutrition-fast-log client gate", () => {
	it("keeps the iOS minimum at 1.6.0", () => {
		expect(NUTRITION_FAST_LOG_IOS_MIN).toBe("1.6.0");
	});

	it("fails closed for iOS 1.5.15 and a missing version", () => {
		expect(
			nutritionFastLogClientAllowed({
				clientPlatform: "ios",
				clientVersion: "1.5.15",
			}),
		).toBe(false);
		expect(nutritionFastLogClientAllowed({ clientPlatform: "ios" })).toBe(
			false,
		);
		expect(
			nutritionFastLogClientAllowed({
				clientPlatform: "ios",
				clientVersion: "1.6.0",
			}),
		).toBe(true);
	});

	it("does not apply the iOS floor to web or mcp", () => {
		expect(nutritionFastLogClientAllowed({ clientPlatform: "web" })).toBe(true);
		expect(nutritionFastLogClientAllowed({ clientPlatform: "mcp" })).toBe(true);
	});

	it("stays off for an old iOS client even when Flagship is on", async () => {
		vi.mocked(isFeatureEnabled).mockResolvedValue(true);
		await expect(
			isNutritionFastLogEnabled({} as Env, {
				clientPlatform: "ios",
				clientVersion: "1.5.15",
			}),
		).resolves.toBe(false);
		expect(isFeatureEnabled).not.toHaveBeenCalled();
	});
});
