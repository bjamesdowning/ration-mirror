import { describe, expect, it } from "vitest";
import {
	SUPPLY_SCAN_COMPLETE_INVALID_MESSAGE,
	SupplyScanCompleteRequestSchema,
} from "~/lib/schemas/supply-scan";

const scanItemId = "11111111-1111-4111-8111-111111111111";
const requestId = "22222222-2222-4222-8222-222222222222";

function basePair(overrides: Record<string, unknown> = {}) {
	return {
		scanItemId,
		matchType: "manual",
		dock: {
			name: "milk",
			quantity: 1,
			unit: "unit",
			domain: "food",
			tags: [],
		},
		...overrides,
	};
}

describe("SupplyScanCompleteRequestSchema", () => {
	it("accepts omitted supplyItemId (receipt-only)", () => {
		const parsed = SupplyScanCompleteRequestSchema.safeParse({
			requestId,
			pairs: [basePair()],
		});
		expect(parsed.success).toBe(true);
		if (parsed.success) {
			expect(parsed.data.pairs[0]?.supplyItemId).toBeUndefined();
		}
	});

	it("accepts null supplyItemId", () => {
		const parsed = SupplyScanCompleteRequestSchema.safeParse({
			requestId,
			pairs: [basePair({ supplyItemId: null })],
		});
		expect(parsed.success).toBe(true);
		if (parsed.success) {
			expect(parsed.data.pairs[0]?.supplyItemId).toBeNull();
		}
	});

	it("accepts nullish expiresAt", () => {
		const parsed = SupplyScanCompleteRequestSchema.safeParse({
			requestId,
			pairs: [
				basePair({
					dock: {
						name: "milk",
						quantity: 1,
						unit: "unit",
						domain: "food",
						tags: [],
						expiresAt: null,
					},
				}),
			],
		});
		expect(parsed.success).toBe(true);
	});
	it("accepts optional dock nutrition snapshot", () => {
		const parsed = SupplyScanCompleteRequestSchema.safeParse({
			requestId,
			pairs: [
				basePair({
					dock: {
						name: "milk",
						quantity: 1,
						unit: "l",
						domain: "food",
						tags: [],
						nutrition: {
							source: "usda",
							confidence: 0.95,
							verified: false,
							per100g: {
								energyKcal: 61,
								proteinG: 3.2,
								fatG: 3.3,
								carbG: 4.8,
								fiberG: 0,
								sugarG: 4.8,
								satFatG: 1.9,
								sodiumMg: 40,
								saltG: 0.1,
							},
							perServing: null,
							fdcId: 746782,
							description: "Milk, whole",
						},
					},
				}),
			],
		});
		expect(parsed.success).toBe(true);
		if (parsed.success) {
			expect(parsed.data.pairs[0]?.dock.nutrition?.source).toBe("usda");
			expect(parsed.data.pairs[0]?.dock.nutrition?.fdcId).toBe(746782);
		}
	});
	it("accepts AI estimate dock nutrition with nullable macros", () => {
		const parsed = SupplyScanCompleteRequestSchema.safeParse({
			requestId,
			pairs: [
				basePair({
					dock: {
						name: "mystery snack",
						quantity: 1,
						unit: "unit",
						domain: "food",
						tags: [],
						nutrition: {
							schemaVersion: 2,
							source: "ai_estimate",
							confidence: 0.5,
							verified: false,
							sourceRef: null,
							matchQuality: "unknown",
							servingBasis: null,
							nutrientCoverage: 0.5,
							per100g: {
								energyKcal: 200,
								proteinG: null,
								fatG: 10,
								carbG: 20,
								fiberG: null,
								sugarG: null,
								satFatG: null,
								sodiumMg: null,
								saltG: null,
							},
							perServing: null,
							fdcId: null,
							description: null,
						},
					},
				}),
			],
		});
		expect(parsed.success).toBe(true);
		if (parsed.success) {
			expect(parsed.data.pairs[0]?.dock.nutrition?.source).toBe("ai_estimate");
		}
	});
});

describe("SUPPLY_SCAN_COMPLETE_INVALID_MESSAGE", () => {
	it("is customer-facing", () => {
		expect(SUPPLY_SCAN_COMPLETE_INVALID_MESSAGE).toContain("couldn't dock");
		expect(SUPPLY_SCAN_COMPLETE_INVALID_MESSAGE.toLowerCase()).not.toContain(
			"zod",
		);
	});
});
