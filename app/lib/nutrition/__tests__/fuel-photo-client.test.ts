import { describe, expect, it } from "vitest";
import {
	fuelPhotoClientFailure,
	fuelPhotoPixelSize,
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
});
