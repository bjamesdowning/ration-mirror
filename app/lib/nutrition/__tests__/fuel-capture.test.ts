import { describe, expect, it } from "vitest";
import { getClientSafeFlags } from "~/lib/feature-flags/flags.server";
import { chargeDiaryFoodLog } from "~/lib/nutrition/diary.server";
import { createMockEnv } from "~/test/helpers/mock-env";
import { foodLogCreditCost } from "../food-log-cost";
import {
	captureLabelsAreExclusive,
	dailyFuelOpensGoals,
	diaryOperationKey,
	FUEL_CAPTURE_CHOICES,
	fuelCaptureChoiceLabels,
	fuelCaptureChoiceVisible,
	fuelLogControlEnabled,
	toManifestDayIntake,
} from "../fuel-capture";

describe("fuel capture", () => {
	it("keeps one sheet with Scan to Cargo and Log to Fuel", () => {
		expect(FUEL_CAPTURE_CHOICES).toEqual(["Scan to Cargo", "Log to Fuel"]);
		expect(captureLabelsAreExclusive(FUEL_CAPTURE_CHOICES)).toBe(true);
		expect(
			captureLabelsAreExclusive(["Scan to Cargo", "Log to Fuel", "Copilot"]),
		).toBe(false);
		expect(captureLabelsAreExclusive(["Scan items"])).toBe(false);
		expect(captureLabelsAreExclusive(["Log food"])).toBe(false);
		expect(captureLabelsAreExclusive(["I ate this"])).toBe(false);
	});

	it("hides the sheet and keeps Goals when the flag is off or iOS is below 1.6", () => {
		expect(
			fuelCaptureChoiceVisible({
				fastLogEnabled: false,
				clientPlatform: "web",
			}),
		).toBe(false);
		expect(
			fuelCaptureChoiceVisible({
				fastLogEnabled: true,
				clientPlatform: "ios",
				clientVersion: "1.5.16",
			}),
		).toBe(false);
		expect(fuelCaptureChoiceLabels(false)).toEqual([]);
		expect(dailyFuelOpensGoals(false)).toBe(true);
		expect(
			fuelCaptureChoiceVisible({
				fastLogEnabled: true,
				clientPlatform: "ios",
				clientVersion: "1.6.0",
			}),
		).toBe(true);
		expect(dailyFuelOpensGoals(true)).toBe(false);
	});

	it("retries one operation key and treats only a null entryId as a personal log", () => {
		expect(diaryOperationKey("same", () => "new")).toBe("same");
		expect(diaryOperationKey("", () => "new")).toBe("new");
		const base = {
			id: "i1",
			manifestDate: "2026-11-09",
			slotType: null,
			servings: 1,
			energyKcal: 1,
			proteinG: 1,
			carbsG: 1,
			fatG: 1,
			mealName: "Oats",
		};
		expect(toManifestDayIntake({ ...base, entryId: null }).personalLog).toBe(
			true,
		);
		expect(toManifestDayIntake({ ...base, entryId: "plan" }).personalLog).toBe(
			false,
		);
		expect(toManifestDayIntake(base).personalLog).toBe(false);
	});

	it("does not charge a typed diary log", () => {
		expect(chargeDiaryFoodLog()).toBe(0);
	});

	it("fails closed in client flags for iOS below 1.6 even when Flagship is on", async () => {
		const env = {
			...createMockEnv(),
			FLAGS: {
				getBooleanValue: async () => true,
			} as unknown as Flagship,
		};
		const ios = await getClientSafeFlags(env, {
			userId: "u1",
			clientPlatform: "ios",
			clientVersion: "1.5.15",
		});
		expect(ios.nutritionFastLog).toBe(false);
		expect(ios.nutritionSavedFood).toBe(false);
		expect(ios.nutritionBarcodeDiary).toBe(false);
		expect(ios.nutritionPhotoLog).toBe(false);
		expect(ios.nutritionHealthExport).toBe(false);
		const web = await getClientSafeFlags(env, {
			userId: "u1",
			clientPlatform: "web",
		});
		expect(web.nutritionFastLog).toBe(true);
		expect(web.nutritionSavedFood).toBe(true);
		expect(web.nutritionBarcodeDiary).toBe(true);
		expect(web.nutritionPhotoLog).toBe(true);
		expect(web.nutritionHealthExport).toBe(true);
	});

	it("keeps shutter and barcode disabled unless their child flags are on", () => {
		expect(
			fuelLogControlEnabled({
				fastLogEnabled: true,
				childEnabled: false,
				clientPlatform: "web",
			}),
		).toBe(false);
		expect(
			fuelLogControlEnabled({
				fastLogEnabled: false,
				childEnabled: true,
				clientPlatform: "ios",
				clientVersion: "1.6.0",
			}),
		).toBe(false);
		expect(
			fuelLogControlEnabled({
				fastLogEnabled: true,
				childEnabled: true,
				clientPlatform: "ios",
				clientVersion: "1.5.18",
			}),
		).toBe(false);
		expect(
			fuelLogControlEnabled({
				fastLogEnabled: true,
				childEnabled: true,
				clientPlatform: "web",
			}),
		).toBe(true);
		expect(foodLogCreditCost("typed")).toBe(0);
		expect(foodLogCreditCost("recent")).toBe(0);
		expect(foodLogCreditCost("custom_amount")).toBe(0);
		expect(foodLogCreditCost("barcode")).toBe(0);
		expect(foodLogCreditCost("photo_model")).toBe(2);
	});
});
