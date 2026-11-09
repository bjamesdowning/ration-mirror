import {
	type BarcodeHit,
	type BarcodeMiss,
	type BrandedBarcodeFood,
	matchBrandedGtin,
	normalizeGtin,
} from "./food-barcode";

const FDC_SEARCH_URL = "https://api.nal.usda.gov/fdc/v1/foods/search";

const NUTRIENT_IDS = {
	energy: 1008,
	protein: 1003,
	fat: 1004,
	carbs: 1005,
	fiber: 1079,
} as const;

type FdcNutrient = {
	nutrientId?: number;
	nutrient?: { id?: number; name?: string };
	nutrientName?: string;
	value?: number;
	amount?: number;
};

type FdcFood = {
	fdcId?: number;
	description?: string;
	dataType?: string;
	gtinUpc?: string;
	foodNutrients?: FdcNutrient[];
};

function nutrientValue(food: FdcFood, id: number, name: string): number | null {
	for (const nutrient of food.foodNutrients ?? []) {
		const nutrientId = nutrient.nutrientId ?? nutrient.nutrient?.id;
		const label = (
			nutrient.nutrientName ??
			nutrient.nutrient?.name ??
			""
		).toLowerCase();
		if (nutrientId !== id && !label.includes(name)) continue;
		const value = nutrient.value ?? nutrient.amount;
		if (typeof value === "number" && Number.isFinite(value)) return value;
	}
	return null;
}

function toBrandedFood(food: FdcFood): BrandedBarcodeFood | null {
	if (typeof food.fdcId !== "number" || !food.description?.trim()) return null;
	return {
		fdcId: food.fdcId,
		description: food.description,
		dataType: food.dataType ?? null,
		gtinUpc: food.gtinUpc ?? null,
		energyKcal: nutrientValue(food, NUTRIENT_IDS.energy, "energy"),
		proteinG: nutrientValue(food, NUTRIENT_IDS.protein, "protein"),
		carbsG: nutrientValue(food, NUTRIENT_IDS.carbs, "carbohydrate"),
		fatG: nutrientValue(food, NUTRIENT_IDS.fat, "lipid"),
		fiberG: nutrientValue(food, NUTRIENT_IDS.fiber, "fiber"),
	};
}

/**
 * One Branded foods/search. A miss is not retried. Open Food Facts is not called.
 */
export async function searchUsdaBrandedByCode(
	env: Env,
	code: string,
	fetchImpl: typeof fetch = fetch,
): Promise<BrandedBarcodeFood[]> {
	const apiKey = env.USDA_FDC_API_KEY?.trim();
	const query = (code ?? "").replace(/\D/g, "");
	if (!apiKey || !query) return [];
	try {
		const response = await fetchImpl(`${FDC_SEARCH_URL}?api_key=${apiKey}`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				query,
				dataType: ["Branded"],
				pageSize: 5,
				pageNumber: 1,
			}),
		});
		if (!response.ok) return [];
		const body = (await response.json()) as { foods?: FdcFood[] };
		return (body.foods ?? []).flatMap((food) => {
			const branded = toBrandedFood(food);
			return branded ? [branded] : [];
		});
	} catch {
		return [];
	}
}

export async function lookupFoodBarcode(
	env: Env,
	code: string,
	fetchImpl: typeof fetch = fetch,
): Promise<BarcodeHit | BarcodeMiss> {
	const foods = await searchUsdaBrandedByCode(env, code, fetchImpl);
	return matchBrandedGtin(normalizeGtin(code) || code, foods);
}
