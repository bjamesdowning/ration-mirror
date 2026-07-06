import { describe, expect, it } from "vitest";
import type { ScanResultItem } from "../schemas/scan";
import type { SupplyItemWithSource } from "../supply.server";
import {
	buildSanitizedScanCompleteInputs,
	SupplyScanError,
	sanitizeDockFromScanItem,
} from "../supply-scan.server";

const scanId = "11111111-1111-4111-8111-111111111111";
const supplyId = "33333333-3333-4333-8333-333333333333";

function scanItem(overrides: Partial<ScanResultItem> = {}): ScanResultItem {
	return {
		id: scanId,
		name: "chicken breast",
		quantity: 2,
		unit: "lb",
		domain: "food",
		tags: ["protein"],
		selected: true,
		confidence: 0.95,
		...overrides,
	};
}

function supplyItem(
	overrides: Partial<SupplyItemWithSource> = {},
): SupplyItemWithSource {
	return {
		id: supplyId,
		listId: "list-1",
		name: "chicken breast",
		quantity: 2,
		unit: "lb",
		domain: "food",
		isPurchased: true,
		sourceMealId: null,
		sourceMealIds: [],
		createdAt: new Date(),
		sourceMealName: null,
		sourceMealNames: [],
		sourceMealSources: [],
		sourceOrigins: [],
		sourceCargoId: null,
		...overrides,
	};
}

describe("sanitizeDockFromScanItem", () => {
	it("uses receipt name/domain/tags regardless of client payload", () => {
		const result = sanitizeDockFromScanItem(scanItem(), {
			name: "evil item",
			quantity: 2,
			unit: "lb",
			domain: "alcohol",
			tags: ["hack"],
		});
		expect(result.name).toBe("chicken breast");
		expect(result.domain).toBe("food");
		expect(result.tags).toEqual(["protein"]);
	});

	it("clamps quantity to a bounded multiplier of receipt qty", () => {
		const result = sanitizeDockFromScanItem(scanItem({ quantity: 2 }), {
			name: "chicken breast",
			quantity: 999,
			unit: "lb",
			domain: "food",
			tags: [],
		});
		expect(result.quantity).toBe(20);
	});

	it("rejects incompatible dock units", () => {
		expect(() =>
			sanitizeDockFromScanItem(scanItem({ unit: "lb" }), {
				name: "chicken breast",
				quantity: 1,
				unit: "ml",
				domain: "food",
				tags: [],
			}),
		).toThrow(SupplyScanError);
	});
});

describe("buildSanitizedScanCompleteInputs", () => {
	it("accepts fuzzy matched pairs above threshold", () => {
		const inputs = buildSanitizedScanCompleteInputs(
			[
				{
					scanItemId: scanId,
					supplyItemId: supplyId,
					matchType: "fuzzy",
					dock: {
						name: "ignored",
						quantity: 2,
						unit: "lb",
						domain: "food",
						tags: [],
					},
				},
			],
			[scanItem()],
			[supplyItem()],
		);
		expect(inputs[0]?.dock.name).toBe("chicken breast");
		expect(inputs[0]?.supplyItemId).toBe(supplyId);
	});

	it("rejects pairings below match threshold unless manual", () => {
		expect(() =>
			buildSanitizedScanCompleteInputs(
				[
					{
						scanItemId: scanId,
						supplyItemId: supplyId,
						matchType: "fuzzy",
						dock: {
							name: "x",
							quantity: 1,
							unit: "lb",
							domain: "food",
							tags: [],
						},
					},
				],
				[scanItem({ name: "mystery spice" })],
				[supplyItem({ name: "chicken breast" })],
			),
		).toThrow(/below match threshold/);
	});

	it("allows manual pairings without score check", () => {
		const inputs = buildSanitizedScanCompleteInputs(
			[
				{
					scanItemId: scanId,
					supplyItemId: supplyId,
					matchType: "manual",
					dock: {
						name: "ignored",
						quantity: 1,
						unit: "lb",
						domain: "food",
						tags: [],
					},
				},
			],
			[scanItem({ name: "mystery spice" })],
			[supplyItem({ name: "chicken breast" })],
		);
		expect(inputs).toHaveLength(1);
	});
});
