import { describe, expect, it } from "vitest";
import type { ScanResultItem } from "../schemas/scan";
import type { SupplyItemWithSource } from "../supply.server";
import { matchScanToSupply } from "../supply-scan-match.server";

const scanId = "11111111-1111-4111-8111-111111111111";
const scanId2 = "22222222-2222-4222-8222-222222222222";
const supplyId = "33333333-3333-4333-8333-333333333333";

function scanItem(overrides: Partial<ScanResultItem>): ScanResultItem {
	return {
		id: scanId,
		name: "item",
		quantity: 2,
		unit: "lb",
		domain: "food",
		tags: [],
		selected: true,
		confidence: 0.9,
		...overrides,
	};
}

function supplyItem(
	overrides: Partial<SupplyItemWithSource>,
): SupplyItemWithSource {
	return {
		id: supplyId,
		listId: "list-1",
		name: "item",
		quantity: 2,
		unit: "lb",
		domain: "food",
		isPurchased: false,
		sourceMealId: null,
		sourceMealIds: [],
		createdAt: new Date(),
		sourceMealName: null,
		sourceMealNames: [],
		sourceMealSources: [],
		...overrides,
	};
}

describe("matchScanToSupply", () => {
	it("pairs exact name matches", () => {
		const result = matchScanToSupply(
			[scanItem({ name: "chicken breast" })],
			[supplyItem({ name: "chicken breast" })],
		);
		expect(result.pairs).toHaveLength(1);
		expect(result.pairs[0]?.supplyItem?.name).toBe("chicken breast");
		expect(result.pairs[0]?.matchType).toBe("exact");
	});

	it("marks wasPreChecked when matched supply item is purchased", () => {
		const result = matchScanToSupply(
			[scanItem({ name: "chicken breast" })],
			[supplyItem({ name: "chicken breast", isPurchased: true })],
		);
		expect(result.pairs).toHaveLength(1);
		expect(result.pairs[0]?.wasPreChecked).toBe(true);
	});

	it("detects quantity delta when receipt is confident", () => {
		const result = matchScanToSupply(
			[
				scanItem({
					name: "chicken breast",
					quantity: 2.1,
					confidence: 0.95,
				}),
			],
			[supplyItem({ name: "chicken breast", quantity: 2 })],
		);
		expect(result.pairs[0]?.quantityProposal.hasDelta).toBe(true);
		expect(result.pairs[0]?.quantityProposal.source).toBe("receipt");
		expect(result.pairs[0]?.quantityProposal.dockQuantity).toBeCloseTo(2.1);
	});

	it("leaves unmatched receipt lines in receiptOnly", () => {
		const result = matchScanToSupply(
			[scanItem({ name: "mystery spice", id: scanId2 })],
			[supplyItem({ name: "chicken breast" })],
		);
		expect(result.pairs).toHaveLength(0);
		expect(result.receiptOnly).toHaveLength(1);
		expect(result.supplyOnly).toHaveLength(1);
	});
});
