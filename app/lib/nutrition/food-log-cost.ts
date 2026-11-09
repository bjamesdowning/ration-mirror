import { AI_COSTS } from "~/lib/ledger.server";

export type FoodLogPath =
	| "typed"
	| "recent"
	| "custom_amount"
	| "barcode"
	| "photo_model";

/** Typed, recent, custom amount, and a barcode match debit nothing. A model photo debits the scan price. */
export function foodLogCreditCost(path: FoodLogPath): number {
	return path === "photo_model" ? AI_COSTS.SCAN : 0;
}

export type FoodLogSubject = "packaged" | "meal" | "loose_produce" | "custom";

/** Meals and loose produce stay off Open Food Facts and USDA branded lookup. */
export function subjectSkipsExternalFoodApi(subject: FoodLogSubject): boolean {
	return subject === "meal" || subject === "loose_produce";
}
