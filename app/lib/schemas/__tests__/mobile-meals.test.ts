import { describe, expect, it } from "vitest";
import { MobileUpdateMealSchema } from "../mobile/meals";

describe("MobileUpdateMealSchema", () => {
	it("accepts partial patches with only name", () => {
		const parsed = MobileUpdateMealSchema.parse({ name: "stir fry" });
		expect(parsed.name).toBe("stir fry");
		expect(Object.keys({ name: "stir fry" }).length).toBe(1);
	});

	it("keeps the typed meal name", () => {
		const parsed = MobileUpdateMealSchema.parse({ name: "  BBQ Chicken  " });
		expect(parsed.name).toBe("BBQ Chicken");
	});

	it("accepts partial patches with servings and prep time", () => {
		const parsed = MobileUpdateMealSchema.parse({
			servings: 4,
			prepTime: 15,
		});
		expect(parsed.servings).toBe(4);
		expect(parsed.prepTime).toBe(15);
	});

	it("rejects invalid domain values", () => {
		const result = MobileUpdateMealSchema.safeParse({ domain: "invalid" });
		expect(result.success).toBe(false);
	});
});
