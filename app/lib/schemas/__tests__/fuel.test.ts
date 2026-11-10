import { describe, expect, it } from "vitest";
import { DiaryFoodWriteSchema } from "~/lib/schemas/diary";
import {
	FUEL_PHOTO_MAX_BYTES,
	FuelBarcodeSchema,
	FuelPhotoContentTypeSchema,
	FuelTimeZoneSchema,
} from "~/lib/schemas/fuel";

describe("fuel schemas", () => {
	it("rejects non-finite macros, bad dates, bad zones, and bad barcodes", () => {
		expect(
			DiaryFoodWriteSchema.safeParse({
				name: "Oats",
				occurredAt: "2026-11-10T12:00:00Z",
				macros: {
					energyKcal: Number.NaN,
					proteinG: 1,
					carbsG: 1,
					fatG: 1,
				},
				idempotencyKey: "11111111-1111-4111-8111-111111111111",
				operationKey: "22222222-2222-4222-8222-222222222222",
			}).success,
		).toBe(false);
		expect(
			DiaryFoodWriteSchema.safeParse({
				name: "Oats",
				occurredAt: "Tuesday",
				macros: { energyKcal: 1, proteinG: 1, carbsG: 1, fatG: 1 },
				idempotencyKey: "11111111-1111-4111-8111-111111111111",
				operationKey: "22222222-2222-4222-8222-222222222222",
			}).success,
		).toBe(false);
		expect(FuelTimeZoneSchema.safeParse("GMT").success).toBe(false);
		expect(FuelTimeZoneSchema.safeParse("Europe/Dublin").success).toBe(true);
		expect(FuelBarcodeSchema.safeParse("abc").success).toBe(false);
		expect(FuelBarcodeSchema.safeParse("1234").success).toBe(false);
		expect(FuelBarcodeSchema.safeParse("012345678905").success).toBe(true);
		expect(
			FuelPhotoContentTypeSchema.safeParse("application/pdf").success,
		).toBe(false);
		expect(FUEL_PHOTO_MAX_BYTES).toBe(3 * 1024 * 1024);
	});
});
