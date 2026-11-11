import { describe, expect, it, vi } from "vitest";
import { isFeatureEnabled } from "~/lib/feature-flags/flags.server";
import {
	isNutritionBarcodeDiaryEnabled,
	isNutritionFastLogEnabled,
	isNutritionFuelPageEnabled,
	isNutritionHealthExportEnabled,
	isNutritionPhotoLogEnabled,
	isNutritionSavedFoodEnabled,
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

	it("keeps saved foods off unless the parent is on and iOS is at least 1.6", async () => {
		vi.mocked(isFeatureEnabled).mockImplementation(
			async (_env, key) => key === "nutrition-saved-food",
		);
		await expect(
			isNutritionSavedFoodEnabled({} as Env, { clientPlatform: "web" }),
		).resolves.toBe(false);
		vi.mocked(isFeatureEnabled).mockResolvedValue(true);
		await expect(
			isNutritionSavedFoodEnabled({} as Env, {
				clientPlatform: "ios",
				clientVersion: "1.5.18",
			}),
		).resolves.toBe(false);
		await expect(
			isNutritionSavedFoodEnabled({} as Env, { clientPlatform: "web" }),
		).resolves.toBe(true);
	});

	it("keeps barcode and photo off unless the parent is on and iOS is at least 1.6", async () => {
		vi.mocked(isFeatureEnabled).mockImplementation(
			async (_env, key) =>
				key === "nutrition-barcode-diary" || key === "nutrition-photo-log",
		);
		await expect(
			isNutritionBarcodeDiaryEnabled({} as Env, { clientPlatform: "web" }),
		).resolves.toBe(false);
		await expect(
			isNutritionPhotoLogEnabled({} as Env, { clientPlatform: "web" }),
		).resolves.toBe(false);
		vi.mocked(isFeatureEnabled).mockResolvedValue(true);
		await expect(
			isNutritionBarcodeDiaryEnabled({} as Env, {
				clientPlatform: "ios",
				clientVersion: "1.5.18",
			}),
		).resolves.toBe(false);
		await expect(
			isNutritionPhotoLogEnabled({} as Env, {
				clientPlatform: "ios",
				clientVersion: "1.5.18",
			}),
		).resolves.toBe(false);
		await expect(
			isNutritionBarcodeDiaryEnabled({} as Env, { clientPlatform: "web" }),
		).resolves.toBe(true);
		await expect(
			isNutritionPhotoLogEnabled({} as Env, { clientPlatform: "web" }),
		).resolves.toBe(true);
	});

	it("keeps Health export off unless the parent is on and iOS is at least 1.6", async () => {
		vi.mocked(isFeatureEnabled).mockImplementation(
			async (_env, key) => key === "nutrition-health-export",
		);
		await expect(
			isNutritionHealthExportEnabled({} as Env, { clientPlatform: "web" }),
		).resolves.toBe(false);
		vi.mocked(isFeatureEnabled).mockResolvedValue(true);
		await expect(
			isNutritionHealthExportEnabled({} as Env, {
				clientPlatform: "ios",
				clientVersion: "1.5.18",
			}),
		).resolves.toBe(false);
		await expect(
			isNutritionHealthExportEnabled({} as Env, { clientPlatform: "web" }),
		).resolves.toBe(true);
	});

	it("keeps the Fuel page off unless nutrition-fast-log is on", async () => {
		vi.mocked(isFeatureEnabled).mockImplementation(
			async (_env, key) => key === "nutrition-fuel-page",
		);
		await expect(
			isNutritionFuelPageEnabled({} as Env, { clientPlatform: "web" }),
		).resolves.toBe(false);
		vi.mocked(isFeatureEnabled).mockResolvedValue(true);
		await expect(
			isNutritionFuelPageEnabled({} as Env, {
				clientPlatform: "ios",
				clientVersion: "1.5.18",
			}),
		).resolves.toBe(false);
		await expect(
			isNutritionFuelPageEnabled({} as Env, { clientPlatform: "web" }),
		).resolves.toBe(true);
	});
});
