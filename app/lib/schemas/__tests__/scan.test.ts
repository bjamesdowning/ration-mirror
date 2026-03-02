import { describe, expect, it } from "vitest";
import {
	BatchAddCargoSchema,
	ScanAIItemSchema,
	ScanResultItemSchema,
} from "~/lib/schemas/scan";

describe("ScanResultItemSchema", () => {
	const validItem = {
		id: crypto.randomUUID(),
		name: "Chicken Breast",
		quantity: 500,
		unit: "g",
		domain: "food" as const,
		tags: [],
		selected: true,
	};

	it("accepts a valid scan result item", () => {
		const result = ScanResultItemSchema.safeParse(validItem);
		expect(result.success).toBe(true);
	});

	it("rejects missing name", () => {
		const result = ScanResultItemSchema.safeParse({ ...validItem, name: "" });
		expect(result.success).toBe(false);
	});

	it("rejects missing id", () => {
		const { id: _id, ...noId } = validItem;
		const result = ScanResultItemSchema.safeParse(noId);
		expect(result.success).toBe(false);
	});

	it("rejects invalid UUID for id", () => {
		const result = ScanResultItemSchema.safeParse({
			...validItem,
			id: "not-a-uuid",
		});
		expect(result.success).toBe(false);
	});

	it("defaults selected to true when omitted", () => {
		const { selected: _selected, ...noSelected } = validItem;
		const result = ScanResultItemSchema.safeParse(noSelected);
		expect(result.success).toBe(true);
		if (result.success) expect(result.data.selected).toBe(true);
	});

	it("defaults tags to empty array when omitted", () => {
		const { tags: _tags, ...noTags } = validItem;
		const result = ScanResultItemSchema.safeParse(noTags);
		expect(result.success).toBe(true);
		if (result.success) expect(result.data.tags).toEqual([]);
	});

	it("rejects negative quantity", () => {
		const result = ScanResultItemSchema.safeParse({
			...validItem,
			quantity: -1,
		});
		expect(result.success).toBe(false);
	});

	it("rejects invalid confidence score > 1", () => {
		const result = ScanResultItemSchema.safeParse({
			...validItem,
			confidence: 1.5,
		});
		expect(result.success).toBe(false);
	});

	it("accepts confidence score of 0", () => {
		const result = ScanResultItemSchema.safeParse({
			...validItem,
			confidence: 0,
		});
		expect(result.success).toBe(true);
	});
});

describe("ScanAIItemSchema", () => {
	it("accepts valid AI item", () => {
		const result = ScanAIItemSchema.safeParse({
			name: "Eggs",
			quantity: 12,
			unit: "unit",
		});
		expect(result.success).toBe(true);
	});

	it("normalises unit aliases (grams → g)", () => {
		const result = ScanAIItemSchema.safeParse({
			name: "Flour",
			quantity: 500,
			unit: "grams",
		});
		expect(result.success).toBe(true);
		if (result.success) expect(result.data.unit).toBe("g");
	});

	it("normalises unit aliases (cups → cup)", () => {
		const result = ScanAIItemSchema.safeParse({
			name: "Milk",
			quantity: 1,
			unit: "cups",
		});
		expect(result.success).toBe(true);
		if (result.success) expect(result.data.unit).toBe("cup");
	});

	it("defaults unit to 'unit' when omitted", () => {
		const result = ScanAIItemSchema.safeParse({ name: "Apples" });
		expect(result.success).toBe(true);
		if (result.success) expect(result.data.unit).toBe("unit");
	});

	it("rejects empty name", () => {
		const result = ScanAIItemSchema.safeParse({ name: "" });
		expect(result.success).toBe(false);
	});

	it("allows optional quantity (returns undefined)", () => {
		const result = ScanAIItemSchema.safeParse({ name: "Salt" });
		expect(result.success).toBe(true);
		if (result.success) expect(result.data.quantity).toBeUndefined();
	});
});

describe("BatchAddCargoSchema", () => {
	const validItem = {
		name: "Tomatoes",
		quantity: 2,
		unit: "kg",
		domain: "food" as const,
		tags: [],
	};

	it("accepts valid batch items", () => {
		const result = BatchAddCargoSchema.safeParse({ items: [validItem] });
		expect(result.success).toBe(true);
	});

	it("accepts empty items array", () => {
		const result = BatchAddCargoSchema.safeParse({ items: [] });
		expect(result.success).toBe(true);
	});

	it("requires mergeTargetId to be a valid UUID when provided", () => {
		const withBadMergeId = {
			items: [{ ...validItem, mergeTargetId: "not-a-uuid" }],
		};
		const result = BatchAddCargoSchema.safeParse(withBadMergeId);
		expect(result.success).toBe(false);
	});

	it("accepts valid UUID for mergeTargetId", () => {
		const withMergeId = {
			items: [{ ...validItem, mergeTargetId: crypto.randomUUID() }],
		};
		const result = BatchAddCargoSchema.safeParse(withMergeId);
		expect(result.success).toBe(true);
	});

	it("rejects item with empty name", () => {
		const result = BatchAddCargoSchema.safeParse({
			items: [{ ...validItem, name: "" }],
		});
		expect(result.success).toBe(false);
	});
});
