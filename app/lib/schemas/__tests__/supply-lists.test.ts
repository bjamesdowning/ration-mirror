import { describe, expect, it } from "vitest";
import {
	SupplyCatalogCreateSchema,
	SupplyFromReceiptSchema,
	SupplyOperationsBatchSchema,
} from "../supply-lists";

describe("SupplyCatalogCreateSchema", () => {
	it("defaults kind to saved", () => {
		expect(SupplyCatalogCreateSchema.parse({ name: "Costco" })).toMatchObject({
			name: "Costco",
			kind: "saved",
		});
	});

	it("rejects a live kind", () => {
		expect(() =>
			SupplyCatalogCreateSchema.parse({ name: "Supply", kind: "live" }),
		).toThrow();
	});
});

describe("SupplyFromReceiptSchema", () => {
	it("requires reviewed items and a scan request id", () => {
		const parsed = SupplyFromReceiptSchema.parse({
			scanRequestId: "scan-1",
			name: "Receipt 7 Sep",
			items: [{ name: "Milk", quantity: 1, unit: "l", domain: "food" }],
		});
		expect(parsed.items).toHaveLength(1);
	});
});

describe("SupplyOperationsBatchSchema", () => {
	it("accepts an offline toggle", () => {
		const parsed = SupplyOperationsBatchSchema.parse({
			baseRevision: 3,
			operations: [
				{
					operationId: "11111111-1111-4111-8111-111111111111",
					type: "toggle_purchased",
					itemId: "22222222-2222-4222-8222-222222222222",
					payload: { isPurchased: true },
				},
			],
		});
		expect(parsed.operations[0]?.type).toBe("toggle_purchased");
	});
});
