import { describe, expect, it } from "vitest";
import { storedDiaryTagNames } from "~/lib/nutrition/diary-tags";
import { fuelPhotoApproveBody } from "~/lib/nutrition/fuel-photo-client";
import { DiaryFoodWriteSchema, DiaryTagNamesSchema } from "~/lib/schemas/diary";

const keys = {
	idempotencyKey: "11111111-1111-4111-8111-111111111111",
	operationKey: "22222222-2222-4222-8222-222222222222",
};

describe("diary tag names", () => {
	it("accepts a 100-character name and a 50-character slug", () => {
		const name = "n".repeat(100);
		const slug = "s".repeat(50);
		const parsed = DiaryTagNamesSchema.parse([{ name, slug }]);
		expect(parsed).toEqual([{ name, slug }]);
		expect(storedDiaryTagNames(parsed)).toEqual([{ name, slug }]);
	});

	it("rejects an eleventh name, a 101-character name, and a 51-character slug", () => {
		expect(DiaryTagNamesSchema.safeParse(Array.from({ length: 11 }, () => "Soup")).success).toBe(
			false,
		);
		expect(DiaryTagNamesSchema.safeParse(["n".repeat(101)]).success).toBe(false);
		expect(
			DiaryTagNamesSchema.safeParse([{ name: "Soup", slug: "s".repeat(51) }]).success,
		).toBe(false);
	});

	it("stores an empty list as null and keeps a typed name", () => {
		expect(storedDiaryTagNames([])).toBeNull();
		expect(storedDiaryTagNames(undefined)).toBeNull();
		const parsed = DiaryFoodWriteSchema.parse({
			name: "Soup",
			amount: 1,
			unit: "serving",
			macros: { energyKcal: 10, proteinG: 1, carbsG: 2, fatG: 0 },
			...keys,
			tagNames: ["Weeknight"],
		});
		expect(parsed.tagNames).toEqual(["Weeknight"]);
	});

	it("leaves tag names off a photo confirm", () => {
		const body = fuelPhotoApproveBody(
			{
				name: "Soup",
				amount: "1",
				unit: "bowl",
				energy: "10",
				protein: "1",
				carbs: "2",
				fat: "0",
			},
			{ ...keys, occurredAt: "2026-11-19T12:00:00.000Z" },
		);
		expect(body).not.toBeNull();
		expect(body && "tagNames" in body).toBe(false);
	});
});
