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

	it("accepts a saved food id without caller macros", () => {
		const parsed = DiaryFoodWriteSchema.parse({
			savedFoodId: "55555555-5555-4555-8555-555555555555",
			idempotencyKey: valid.idempotencyKey,
			operationKey: valid.operationKey,
			occurredAt: valid.occurredAt,
		});
		expect(parsed.savedFoodId).toBe("55555555-5555-4555-8555-555555555555");
		expect(parsed.macros).toBeUndefined();
	});

	it("accepts a cup label; conversion is decided from stored gram weights", () => {
		expect(DiaryFoodWriteSchema.parse({ ...valid, unit: "cup" }).unit).toBe(
			"cup",
		);
	});

	it("accepts per 100 g density without typed macros", () => {
		const { macros: _macros, ...rest } = valid;
		const parsed = DiaryFoodWriteSchema.parse({
			...rest,
			unit: "cup",
			amount: 1,
			per100g: valid.macros,
			fdcId: "171287",
		});
		expect(parsed.macros).toBeUndefined();
		expect(parsed.per100g?.energyKcal).toBe(120);
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
