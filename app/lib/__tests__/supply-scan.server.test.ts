import { describe, expect, it } from "vitest";
import { computeBaseFields } from "../base-quantity";
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
	const quantity = overrides.quantity ?? 2;
	const unit = overrides.unit ?? "lb";
	const name = overrides.name ?? "chicken breast";
	const base = computeBaseFields(quantity, unit, name);
	return {
		id: supplyId,
		listId: "list-1",
		name,
		quantity,
		unit,
		baseQuantity: overrides.baseQuantity ?? base.baseQuantity,
		baseUnit: overrides.baseUnit ?? base.baseUnit,
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
	it("honors client name/domain/tags within bounds", () => {
		const result = sanitizeDockFromScanItem(scanItem(), {
			name: "organic chicken",
			quantity: 2,
			unit: "lb",
			domain: "alcohol",
			tags: ["hack"],
		});
		expect(result.name).toBe("organic chicken");
		expect(result.domain).toBe("alcohol");
		expect(result.tags).toEqual(["hack"]);
		expect(result.quantity).toBe(2);
	});

	it("rejects quantity above the bounded multiplier of receipt qty", () => {
		expect(() =>
			sanitizeDockFromScanItem(scanItem({ quantity: 2 }), {
				name: "chicken breast",
				quantity: 999,
				unit: "lb",
				domain: "food",
				tags: [],
			}),
		).toThrow(/too high/i);
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
		expect(inputs[0]?.dock.name).toBe("ignored");
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
