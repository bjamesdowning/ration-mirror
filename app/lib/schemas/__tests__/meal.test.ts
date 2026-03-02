import { describe, expect, it } from "vitest";
import {
	MealIngredientSchema,
	MealSchema,
	ProvisionSchema,
} from "~/lib/schemas/meal";

describe("MealIngredientSchema", () => {
	const validIngredient = {
		ingredientName: "Chicken Breast",
		quantity: 500,
		unit: "g",
	};

	it("accepts a valid ingredient", () => {
		const result = MealIngredientSchema.safeParse(validIngredient);
		expect(result.success).toBe(true);
	});

	it("lowercases ingredientName", () => {
		const result = MealIngredientSchema.safeParse(validIngredient);
		if (result.success)
			expect(result.data.ingredientName).toBe("chicken breast");
	});

	it("normalises unit aliases (grams → g)", () => {
		const result = MealIngredientSchema.safeParse({
			...validIngredient,
			unit: "grams",
		});
		if (result.success) expect(result.data.unit).toBe("g");
	});

	it("coerces quantity from string", () => {
		const result = MealIngredientSchema.safeParse({
			...validIngredient,
			quantity: "200",
		});
		expect(result.success).toBe(true);
		if (result.success) expect(result.data.quantity).toBe(200);
	});

	it("rejects empty ingredientName", () => {
		const result = MealIngredientSchema.safeParse({
			...validIngredient,
			ingredientName: "",
		});
		expect(result.success).toBe(false);
	});

	it("rejects negative quantity", () => {
		const result = MealIngredientSchema.safeParse({
			...validIngredient,
			quantity: -1,
		});
		expect(result.success).toBe(false);
	});

	it("defaults isOptional to false", () => {
		const result = MealIngredientSchema.safeParse(validIngredient);
		if (result.success) expect(result.data.isOptional).toBe(false);
	});

	it("converts empty string cargoId to null", () => {
		const result = MealIngredientSchema.safeParse({
			...validIngredient,
			cargoId: "",
		});
		if (result.success) expect(result.data.cargoId).toBeNull();
	});
});

describe("MealSchema", () => {
	const validMeal = {
		name: "Chicken Stir Fry",
		servings: 4,
		ingredients: [
			{ ingredientName: "Chicken Breast", quantity: 500, unit: "g" },
		],
	};

	it("accepts a valid meal", () => {
		const result = MealSchema.safeParse(validMeal);
		expect(result.success).toBe(true);
	});

	it("lowercases meal name", () => {
		const result = MealSchema.safeParse(validMeal);
		if (result.success) expect(result.data.name).toBe("chicken stir fry");
	});

	it("rejects empty meal name", () => {
		const result = MealSchema.safeParse({ ...validMeal, name: "" });
		expect(result.success).toBe(false);
	});

	it("defaults domain to 'food'", () => {
		const result = MealSchema.safeParse(validMeal);
		if (result.success) expect(result.data.domain).toBe("food");
	});

	it("defaults servings to 1 when omitted", () => {
		const { servings: _servings, ...noServings } = validMeal;
		const result = MealSchema.safeParse(noServings);
		if (result.success) expect(result.data.servings).toBe(1);
	});

	it("rejects servings of 0", () => {
		const result = MealSchema.safeParse({ ...validMeal, servings: 0 });
		expect(result.success).toBe(false);
	});

	it("defaults ingredients to empty array when omitted", () => {
		const { ingredients: _ing, ...noIng } = validMeal;
		const result = MealSchema.safeParse(noIng);
		if (result.success) expect(result.data.ingredients).toEqual([]);
	});

	it("lowercases tags", () => {
		const result = MealSchema.safeParse({
			...validMeal,
			tags: ["Vegan", "QUICK"],
		});
		if (result.success) expect(result.data.tags).toEqual(["vegan", "quick"]);
	});

	it("serializes directions string to JSON RecipeStep[] format", () => {
		const result = MealSchema.safeParse({
			...validMeal,
			directions: "Step one.\nStep two.",
		});
		if (result.success) {
			expect(result.data.directions).toBeDefined();
			expect(result.data.directions?.startsWith("[")).toBe(true);
		}
	});
});

describe("ProvisionSchema", () => {
	const validProvision = {
		name: "Greek Yogurt",
		quantity: 200,
		unit: "g",
	};

	it("accepts a valid provision", () => {
		const result = ProvisionSchema.safeParse(validProvision);
		expect(result.success).toBe(true);
	});

	it("trims and lowercases name", () => {
		const result = ProvisionSchema.safeParse({
			...validProvision,
			name: "  Greek Yogurt  ",
		});
		if (result.success) expect(result.data.name).toBe("greek yogurt");
	});

	it("rejects zero quantity", () => {
		const result = ProvisionSchema.safeParse({
			...validProvision,
			quantity: 0,
		});
		expect(result.success).toBe(false);
	});

	it("rejects negative quantity", () => {
		const result = ProvisionSchema.safeParse({
			...validProvision,
			quantity: -5,
		});
		expect(result.success).toBe(false);
	});

	it("normalises unit aliases", () => {
		const result = ProvisionSchema.safeParse({
			...validProvision,
			unit: "kilograms",
		});
		if (result.success) expect(result.data.unit).toBe("kg");
	});
});
