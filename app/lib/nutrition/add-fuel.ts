import {
	type CargoEatMacroPreview,
	scaleCargoEatMacros,
} from "./cargo-eat-macros";
import type { NutritionSnapshot } from "./types";

export type AddFuelMacros = {
	energyKcal: number;
	proteinG: number;
	carbsG: number;
	fatG: number;
};

export type AddFuelTag = {
	name: string;
	slug?: string;
};

/** OR match on display names. An empty selection keeps every row. */
export function matchesTagDisplayNames(
	tags: readonly AddFuelTag[],
	selected: readonly string[],
): boolean {
	if (selected.length === 0) return true;
	const names = new Set(tags.map((tag) => tag.name));
	return selected.some((name) => names.has(name));
}

function finiteOrZero(value: number | null): number {
	return value != null && Number.isFinite(value) ? value : 0;
}

function macrosFromPreview(preview: CargoEatMacroPreview): AddFuelMacros | null {
	if (
		preview.energyKcal == null &&
		preview.proteinG == null &&
		preview.carbG == null &&
		preview.fatG == null
	) {
		return null;
	}
	return {
		energyKcal: finiteOrZero(preview.energyKcal),
		proteinG: finiteOrZero(preview.proteinG),
		carbsG: finiteOrZero(preview.carbG),
		fatG: finiteOrZero(preview.fatG),
	};
}

/** Cargo quick-add. `carbG` from the scaler is posted as `carbsG`. */
export function cargoAddFuelMacros(input: {
	nutrition: NutritionSnapshot | null | undefined;
	quantity: number;
	unit: string;
	packageQuantity?: number | null;
}): AddFuelMacros | null {
	return macrosFromPreview(scaleCargoEatMacros(input));
}

/** Galley quick-add. Each per-serving macro is multiplied by servings. */
export function mealAddFuelMacros(
	perServing: AddFuelMacros,
	servings: number,
): AddFuelMacros | null {
	if (!(servings > 0) || !Number.isFinite(servings)) return null;
	return {
		energyKcal: perServing.energyKcal * servings,
		proteinG: perServing.proteinG * servings,
		carbsG: perServing.carbsG * servings,
		fatG: perServing.fatG * servings,
	};
}

export type ManualFuelEntry = {
	name: string;
	amount: number;
	unit: string;
	macros: AddFuelMacros;
	tagNames: string[];
};

/** A blank name, a non-positive amount, or a negative macro does not save. */
export function manualFuelEntry(input: {
	name: string;
	amount: number;
	unit: string;
	energyKcal: number;
	proteinG: number;
	carbsG: number;
	fatG: number;
	tagNames: string[];
}): ManualFuelEntry | null {
	const name = input.name.trim();
	const unit = input.unit.trim();
	const macros = [
		input.energyKcal,
		input.proteinG,
		input.carbsG,
		input.fatG,
	];
	if (
		name.length === 0 ||
		unit.length === 0 ||
		!(input.amount > 0) ||
		!Number.isFinite(input.amount) ||
		macros.some((value) => !Number.isFinite(value) || value < 0)
	) {
		return null;
	}
	const tagNames = input.tagNames
		.map((tag) => tag.trim())
		.filter((tag) => tag.length > 0);
	if (tagNames.length > 10 || tagNames.some((tag) => tag.length > 100)) {
		return null;
	}
	return {
		name,
		amount: input.amount,
		unit,
		macros: {
			energyKcal: input.energyKcal,
			proteinG: input.proteinG,
			carbsG: input.carbsG,
			fatG: input.fatG,
		},
		tagNames,
	};
}
