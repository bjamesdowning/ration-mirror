import { describe, expect, it } from "vitest";
import {
	AddFromMealSchema,
	SnoozeItemSchema,
	SupplyItemSchema,
	SupplyItemUpdateSchema,
	SupplyListSchema,
} from "~/lib/schemas/supply";

describe("SupplyListSchema", () => {
	it("accepts a valid list name", () => {
		const result = SupplyListSchema.safeParse({ name: "Weekly Shop" });
		expect(result.success).toBe(true);
	});

	it("lowercases the list name", () => {
		const result = SupplyListSchema.safeParse({ name: "WEEKLY SHOP" });
		if (result.success) expect(result.data.name).toBe("weekly shop");
	});

	it("accepts omitted name (optional)", () => {
		const result = SupplyListSchema.safeParse({});
		expect(result.success).toBe(true);
	});

	it("rejects empty string name", () => {
		const result = SupplyListSchema.safeParse({ name: "" });
		expect(result.success).toBe(false);
	});

	it("rejects name longer than 100 characters", () => {
		const result = SupplyListSchema.safeParse({ name: "a".repeat(101) });
		expect(result.success).toBe(false);
	});
});

describe("SupplyItemSchema", () => {
	const validItem = { name: "Milk", quantity: 2, unit: "l" };

	it("accepts a valid supply item", () => {
		const result = SupplyItemSchema.safeParse(validItem);
		expect(result.success).toBe(true);
	});

	it("lowercases item name", () => {
		const result = SupplyItemSchema.safeParse({ ...validItem, name: "MILK" });
		if (result.success) expect(result.data.name).toBe("milk");
	});

	it("defaults quantity to 1 when omitted", () => {
		const result = SupplyItemSchema.safeParse({ name: "Milk", unit: "l" });
		if (result.success) expect(result.data.quantity).toBe(1);
	});

	it("defaults unit to 'unit' when omitted", () => {
		const result = SupplyItemSchema.safeParse({ name: "Milk" });
		if (result.success) expect(result.data.unit).toBe("unit");
	});

	it("defaults domain to 'food' when omitted", () => {
		const result = SupplyItemSchema.safeParse(validItem);
		if (result.success) expect(result.data.domain).toBe("food");
	});

	it("rejects empty name", () => {
		const result = SupplyItemSchema.safeParse({ ...validItem, name: "" });
		expect(result.success).toBe(false);
	});

	it("rejects name longer than 200 characters", () => {
		const result = SupplyItemSchema.safeParse({
			...validItem,
			name: "a".repeat(201),
		});
		expect(result.success).toBe(false);
	});

	it("accepts valid UUID for sourceMealId", () => {
		const result = SupplyItemSchema.safeParse({
			...validItem,
			sourceMealId: crypto.randomUUID(),
		});
		expect(result.success).toBe(true);
	});

	it("rejects invalid UUID for sourceMealId", () => {
		const result = SupplyItemSchema.safeParse({
			...validItem,
			sourceMealId: "not-uuid",
		});
		expect(result.success).toBe(false);
	});

	it("coerces quantity from string", () => {
		const result = SupplyItemSchema.safeParse({
			name: "Bread",
			quantity: "3",
			unit: "unit",
		});
		expect(result.success).toBe(true);
		if (result.success) expect(result.data.quantity).toBe(3);
	});
});

describe("SupplyItemUpdateSchema", () => {
	it("accepts partial updates", () => {
		const result = SupplyItemUpdateSchema.safeParse({ quantity: 5 });
		expect(result.success).toBe(true);
	});

	it("coerces isPurchased from string 'true'", () => {
		const result = SupplyItemUpdateSchema.safeParse({ isPurchased: "true" });
		if (result.success) expect(result.data.isPurchased).toBe(true);
	});

	it("coerces isPurchased from string 'false'", () => {
		const result = SupplyItemUpdateSchema.safeParse({ isPurchased: "false" });
		if (result.success) expect(result.data.isPurchased).toBe(false);
	});

	it("accepts boolean isPurchased directly", () => {
		const result = SupplyItemUpdateSchema.safeParse({ isPurchased: true });
		if (result.success) expect(result.data.isPurchased).toBe(true);
	});
});

describe("AddFromMealSchema", () => {
	it("accepts valid mealId", () => {
		const result = AddFromMealSchema.safeParse({ mealId: crypto.randomUUID() });
		expect(result.success).toBe(true);
	});

	it("rejects invalid mealId UUID", () => {
		const result = AddFromMealSchema.safeParse({ mealId: "not-uuid" });
		expect(result.success).toBe(false);
	});

	it("accepts optional servings", () => {
		const result = AddFromMealSchema.safeParse({
			mealId: crypto.randomUUID(),
			servings: 4,
		});
		expect(result.success).toBe(true);
	});

	it("rejects servings of 0", () => {
		const result = AddFromMealSchema.safeParse({
			mealId: crypto.randomUUID(),
			servings: 0,
		});
		expect(result.success).toBe(false);
	});
});

describe("SnoozeItemSchema", () => {
	it("accepts valid snooze durations", () => {
		for (const duration of ["24h", "3d", "1w"]) {
			const result = SnoozeItemSchema.safeParse({ duration });
			expect(result.success, `Expected ${duration} to be valid`).toBe(true);
		}
	});

	it("rejects unknown duration", () => {
		const result = SnoozeItemSchema.safeParse({ duration: "2w" });
		expect(result.success).toBe(false);
	});
});
