import { describe, expect, it } from "vitest";
import { DiaryFoodWriteSchema, DiaryKitchenSaveSchema } from "../diary";

const valid = {
	name: "Yogurt",
	macros: { energyKcal: 120, proteinG: 10, carbsG: 8, fatG: 4, fiberG: null },
	idempotencyKey: "22222222-2222-4222-8222-222222222222",
	operationKey: "11111111-1111-4111-8111-111111111111",
	amount: 150,
	unit: "g" as const,
	occurredAt: "2026-06-21T22:30:00.000Z",
};

describe("DiaryFoodWriteSchema", () => {
	it("accepts typed macros with grams", () => {
		expect(DiaryFoodWriteSchema.parse(valid).name).toBe("Yogurt");
	});

	it("rejects an amount without a unit", () => {
		const parsed = DiaryFoodWriteSchema.safeParse({
			...valid,
			unit: undefined,
		});
		expect(parsed.success).toBe(false);
	});

	it("rejects a cup, which this log cannot convert", () => {
		const parsed = DiaryFoodWriteSchema.safeParse({ ...valid, unit: "cup" });
		expect(parsed.success).toBe(false);
	});

	it("requires confirm on a kitchen save", () => {
		const parsed = DiaryKitchenSaveSchema.safeParse({
			confirm: false,
			target: "cargo",
			operationKey: valid.operationKey,
		});
		expect(parsed.success).toBe(true);
		if (parsed.success) expect(parsed.data.confirm).toBe(false);
	});
});
