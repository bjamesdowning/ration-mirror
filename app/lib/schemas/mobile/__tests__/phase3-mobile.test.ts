import { describe, expect, it } from "vitest";
import { MobileSettingsPatchSchema } from "~/lib/schemas/mobile/auth";
import { MobileHubResponseSchema } from "~/lib/schemas/mobile/hub";
import {
	MobileBulkEntryCreateSchema,
	MobileImportConfirmRequestSchema,
	MobileWeekPlanRequestSchema,
} from "~/lib/schemas/mobile/manifest";
import {
	MobileCreateMealSchema,
	MobileMealsListQuerySchema,
} from "~/lib/schemas/mobile/meals";

describe("MobileMealsListQuerySchema", () => {
	it("accepts limit, tag, and domain", () => {
		const result = MobileMealsListQuerySchema.safeParse({
			limit: "25",
			tag: "vegetarian",
			domain: "food",
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.limit).toBe(25);
			expect(result.data.tag).toBe("vegetarian");
			expect(result.data.domain).toBe("food");
		}
	});

	it("rejects invalid domain", () => {
		const result = MobileMealsListQuerySchema.safeParse({
			domain: "pets",
		});
		expect(result.success).toBe(false);
	});
});

describe("MobileCreateMealSchema", () => {
	it("requires a meal name", () => {
		const result = MobileCreateMealSchema.safeParse({
			name: "",
			ingredients: [],
		});
		expect(result.success).toBe(false);
	});

	it("accepts a minimal valid meal", () => {
		const result = MobileCreateMealSchema.safeParse({
			name: "Pasta",
			ingredients: [],
		});
		expect(result.success).toBe(true);
	});
});

describe("MobileWeekPlanRequestSchema", () => {
	it("accepts a valid week plan request", () => {
		const result = MobileWeekPlanRequestSchema.safeParse({
			startDate: "2026-06-29",
			slots: ["dinner"],
			days: 7,
		});
		expect(result.success).toBe(true);
	});
});

describe("MobileBulkEntryCreateSchema", () => {
	it("requires at least one entry", () => {
		const result = MobileBulkEntryCreateSchema.safeParse({ entries: [] });
		expect(result.success).toBe(false);
	});
});

describe("MobileImportConfirmRequestSchema", () => {
	it("requires a UUID requestId", () => {
		const result = MobileImportConfirmRequestSchema.safeParse({
			requestId: "not-a-uuid",
		});
		expect(result.success).toBe(false);
	});
});

describe("MobileSettingsPatchSchema hub fields", () => {
	it("accepts hubProfile and hubLayout", () => {
		const result = MobileSettingsPatchSchema.safeParse({
			hubProfile: "cook",
			hubLayout: {
				widgets: [
					{
						id: "hub-stats",
						order: 0,
						visible: true,
					},
				],
			},
		});
		expect(result.success).toBe(true);
	});
});

describe("MobileHubResponseSchema", () => {
	it("accepts a minimal hub payload", () => {
		const result = MobileHubResponseSchema.safeParse({
			expiringItems: [],
			cargoStats: { totalItems: 0, expiringCount: 0 },
			latestSupplyList: null,
			manifestPreview: null,
			expirationAlertDays: 7,
			availableMealTags: [],
			mealMatches: [],
			partialMealMatches: [],
			snackMatches: [],
		});
		expect(result.success).toBe(true);
	});
});
