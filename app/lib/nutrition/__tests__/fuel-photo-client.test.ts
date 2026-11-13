import { describe, expect, it } from "vitest";
import {
	fuelPhotoApproveBody,
	fuelPhotoClientFailure,
	fuelPhotoPixelSize,
	fuelPhotoReviewFromLines,
} from "~/lib/nutrition/fuel-photo-client";

describe("fuel photo client", () => {
	it("downscales the long side to 1024 and leaves a small frame alone", () => {
		expect(fuelPhotoPixelSize(4032, 3024)).toEqual({
			width: 1024,
			height: 768,
		});
		expect(fuelPhotoPixelSize(800, 600)).toEqual({ width: 800, height: 600 });
	});

	it("shows the photo, consent, flag, rate limit, and credit failures as themselves", () => {
		expect(
			fuelPhotoClientFailure(400, {
				code: "photo_too_large",
				error: "Photo must be 3 MiB or smaller.",
			}),
		).toEqual({
			kind: "message",
			message: "Photo must be 3 MiB or smaller.",
		});
		expect(
			fuelPhotoClientFailure(403, {
				code: "consent_required",
				error: "AI features need your OK.",
			}),
		).toEqual({ kind: "message", message: "AI features need your OK." });
		expect(fuelPhotoClientFailure(403, { code: "FEATURE_DISABLED" })).toEqual({
			kind: "message",
			message: "Photo food log is unavailable.",
		});
		expect(
			fuelPhotoClientFailure(429, {
				error: "Too many requests. Please try again later.",
			}),
		).toEqual({
			kind: "message",
			message: "Too many requests. Please try again later.",
		});
		expect(
			fuelPhotoClientFailure(402, {
				code: "insufficient_credits",
				error: "Insufficient credits",
			}),
		).toEqual({ kind: "credits" });
		expect(fuelPhotoClientFailure(403, { code: "fuel_daily_limit" })).toEqual({
			kind: "crew",
		});
	});

	it("approves the edited name, amount, unit, and four macros", () => {
		const review = fuelPhotoReviewFromLines([
			{
				name: "Soup",
				amount: 250,
				unit: "g",
				energyKcal: 120,
				proteinG: 4,
				carbsG: 10,
				fatG: 6,
			},
		]);
		review.name = "Tomato soup";
		review.amount = "300";
		review.unit = "ml";
		review.energy = "140";
		review.protein = "5";
		review.carbs = "12";
		review.fat = "7";
		expect(
			fuelPhotoApproveBody(review, {
				idempotencyKey: "key",
				operationKey: "key",
				occurredAt: "2026-11-10T12:00:00.000Z",
			}),
		).toEqual({
			name: "Tomato soup",
			occurredAt: "2026-11-10T12:00:00.000Z",
			amount: 300,
			unit: "ml",
			macros: { energyKcal: 140, proteinG: 5, carbsG: 12, fatG: 7 },
			idempotencyKey: "key",
			operationKey: "key",
			compositionSource: "ai_estimate",
		});
	});

	it("does not approve a blank name, a non-positive amount, or a missing macro", () => {
		const review = fuelPhotoReviewFromLines([
			{ name: "Soup", amount: 1, unit: "serving", energyKcal: 10 },
		]);
		const keys = {
			idempotencyKey: "key",
			operationKey: "key",
			occurredAt: "2026-11-10T12:00:00.000Z",
		};
		expect(fuelPhotoApproveBody({ ...review, name: "  " }, keys)).toBeNull();
		expect(fuelPhotoApproveBody({ ...review, amount: "0" }, keys)).toBeNull();
		expect(fuelPhotoApproveBody({ ...review, fat: "" }, keys)).toBeNull();
	});
});
