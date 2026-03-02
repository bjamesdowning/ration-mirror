import { describe, expect, it } from "vitest";
import {
	GalleyManifestSchema,
	ManifestMealSchema,
} from "~/lib/schemas/galley-manifest";

describe("ManifestMealSchema — recipe type", () => {
	const validRecipe = {
		type: "recipe" as const,
		name: "Pasta Carbonara",
		servings: 2,
		ingredients: [{ ingredientName: "Spaghetti", quantity: 200, unit: "g" }],
	};

	it("accepts a valid recipe manifest entry", () => {
		const result = ManifestMealSchema.safeParse(validRecipe);
		expect(result.success).toBe(true);
	});

	it("lowercases recipe name", () => {
		const result = ManifestMealSchema.safeParse(validRecipe);
		if (result.success) expect(result.data.name).toBe("pasta carbonara");
	});

	it("accepts optional UUID id", () => {
		const result = ManifestMealSchema.safeParse({
			...validRecipe,
			id: crypto.randomUUID(),
		});
		expect(result.success).toBe(true);
	});

	it("rejects invalid UUID for id", () => {
		const result = ManifestMealSchema.safeParse({
			...validRecipe,
			id: "not-a-uuid",
		});
		expect(result.success).toBe(false);
	});

	it("rejects empty recipe name", () => {
		const result = ManifestMealSchema.safeParse({ ...validRecipe, name: "" });
		expect(result.success).toBe(false);
	});

	it("rejects servings of 0", () => {
		const result = ManifestMealSchema.safeParse({
			...validRecipe,
			servings: 0,
		});
		expect(result.success).toBe(false);
	});

	it("normalises ingredient unit aliases", () => {
		const result = ManifestMealSchema.safeParse({
			...validRecipe,
			ingredients: [{ ingredientName: "Flour", quantity: 200, unit: "grams" }],
		});
		if (result.success && result.data.type === "recipe") {
			expect(result.data.ingredients[0].unit).toBe("g");
		}
	});

	it("lowercases ingredient names", () => {
		const result = ManifestMealSchema.safeParse(validRecipe);
		if (result.success && result.data.type === "recipe") {
			expect(result.data.ingredients[0].ingredientName).toBe("spaghetti");
		}
	});
});

describe("ManifestMealSchema — provision type", () => {
	const validProvision = {
		type: "provision" as const,
		name: "Greek Yogurt",
		quantity: 200,
		unit: "g",
	};

	it("accepts a valid provision manifest entry", () => {
		const result = ManifestMealSchema.safeParse(validProvision);
		expect(result.success).toBe(true);
	});

	it("trims and lowercases provision name", () => {
		const result = ManifestMealSchema.safeParse({
			...validProvision,
			name: "  Greek Yogurt  ",
		});
		if (result.success) expect(result.data.name).toBe("greek yogurt");
	});

	it("rejects zero quantity", () => {
		const result = ManifestMealSchema.safeParse({
			...validProvision,
			quantity: 0,
		});
		expect(result.success).toBe(false);
	});

	it("normalises provision unit aliases", () => {
		const result = ManifestMealSchema.safeParse({
			...validProvision,
			unit: "kilograms",
		});
		if (result.success && result.data.type === "provision") {
			expect(result.data.unit).toBe("kg");
		}
	});
});

describe("GalleyManifestSchema — full manifest", () => {
	const validManifest = {
		version: 1 as const,
		exportedAt: "2025-01-01T00:00:00Z",
		meals: [
			{
				type: "recipe" as const,
				name: "Pasta Carbonara",
				servings: 2,
				ingredients: [],
			},
			{
				type: "provision" as const,
				name: "Greek Yogurt",
				quantity: 200,
				unit: "g",
			},
		],
	};

	it("accepts a full valid manifest", () => {
		const result = GalleyManifestSchema.safeParse(validManifest);
		expect(result.success).toBe(true);
	});

	it("defaults version to 1 when omitted", () => {
		const { version: _version, ...noVersion } = validManifest;
		const result = GalleyManifestSchema.safeParse(noVersion);
		if (result.success) expect(result.data.version).toBe(1);
	});

	it("accepts empty meals array", () => {
		const result = GalleyManifestSchema.safeParse({ version: 1, meals: [] });
		expect(result.success).toBe(true);
	});

	it("defaults meals to empty array when omitted", () => {
		const result = GalleyManifestSchema.safeParse({ version: 1 });
		if (result.success) expect(result.data.meals).toEqual([]);
	});

	it("rejects version != 1", () => {
		const result = GalleyManifestSchema.safeParse({
			...validManifest,
			version: 2,
		});
		expect(result.success).toBe(false);
	});

	it("round-trips: parse then check structure integrity", () => {
		const result = GalleyManifestSchema.safeParse(validManifest);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.meals).toHaveLength(2);
			expect(result.data.meals[0].type).toBe("recipe");
			expect(result.data.meals[1].type).toBe("provision");
		}
	});
});
