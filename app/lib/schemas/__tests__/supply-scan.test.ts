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
});

describe("SUPPLY_SCAN_COMPLETE_INVALID_MESSAGE", () => {
	it("is customer-facing", () => {
		expect(SUPPLY_SCAN_COMPLETE_INVALID_MESSAGE).toContain("couldn't dock");
		expect(SUPPLY_SCAN_COMPLETE_INVALID_MESSAGE.toLowerCase()).not.toContain(
			"zod",
		);
	});
});
