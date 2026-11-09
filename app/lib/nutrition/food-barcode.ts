/**
 * USDA Branded barcode match. Gram weights and product facts come from the
 * response. This module does not invent a product and does not call any API.
 */
export type BrandedBarcodeFood = {
	fdcId: number;
	description: string;
	dataType?: string | null;
	gtinUpc?: string | null;
	energyKcal?: number | null;
	proteinG?: number | null;
	carbsG?: number | null;
	fatG?: number | null;
	fiberG?: number | null;
};

export type BarcodeHit = {
	found: true;
	source: "usda_branded";
	name: string;
	fdcId: string;
	gtinUpc: string;
	macros: {
		energyKcal: number;
		proteinG: number;
		carbsG: number;
		fatG: number;
		fiberG: number | null;
	} | null;
};

export type BarcodeMiss = {
	found: false;
	next: "custom_add";
	barcode: string;
};

export function normalizeGtin(value: string | null | undefined): string {
	const digits = (value ?? "").replace(/\D/g, "");
	if (!digits) return "";
	const stripped = digits.replace(/^0+/, "");
	return stripped.length > 0 ? stripped : "0";
}

export function gtinMatches(
	scanned: string,
	gtinUpc: string | null | undefined,
): boolean {
	const left = normalizeGtin(scanned);
	const right = normalizeGtin(gtinUpc);
	return left.length > 0 && left !== "0" && left === right;
}

function isBranded(food: BrandedBarcodeFood): boolean {
	const dataType = food.dataType?.trim().toLowerCase();
	return dataType == null || dataType.length === 0 || dataType === "branded";
}

/**
 * Accept the first Branded food whose gtinUpc matches. Any other hit is a miss,
 * including a branded text hit with a different code.
 */
export function matchBrandedGtin(
	code: string,
	foods: readonly BrandedBarcodeFood[],
): BarcodeHit | BarcodeMiss {
	const barcode = normalizeGtin(code);
	if (!barcode || barcode === "0") {
		return { found: false, next: "custom_add", barcode: code.trim() };
	}
	for (const food of foods) {
		if (!isBranded(food) || !gtinMatches(barcode, food.gtinUpc)) continue;
		const name = food.description.trim();
		if (!name || !Number.isFinite(food.fdcId)) continue;
		const macros = macrosFromFood(food);
		return {
			found: true,
			source: "usda_branded",
			name,
			fdcId: String(food.fdcId),
			gtinUpc: normalizeGtin(food.gtinUpc),
			macros,
		};
	}
	return { found: false, next: "custom_add", barcode };
}

function macrosFromFood(food: BrandedBarcodeFood): BarcodeHit["macros"] {
	const energy = food.energyKcal;
	const protein = food.proteinG;
	const carbs = food.carbsG;
	const fat = food.fatG;
	if (
		energy == null ||
		protein == null ||
		carbs == null ||
		fat == null ||
		!Number.isFinite(energy) ||
		!Number.isFinite(protein) ||
		!Number.isFinite(carbs) ||
		!Number.isFinite(fat)
	) {
		return null;
	}
	return {
		energyKcal: energy,
		proteinG: protein,
		carbsG: carbs,
		fatG: fat,
		fiberG:
			food.fiberG != null && Number.isFinite(food.fiberG) ? food.fiberG : null,
	};
}
