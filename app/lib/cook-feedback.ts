import type { MissingIngredientDetail } from "./matching.server";

export function formatSkippedIngredientNames(
	skipped: Array<Pick<MissingIngredientDetail, "name">> | undefined,
): string {
	if (!skipped?.length) return "";
	return skipped.map((item) => item.name).join(", ");
}

export type CookFeedbackInput = {
	partialCook?: boolean;
	skippedIngredients?: Array<Pick<MissingIngredientDetail, "name">>;
	deductionCount?: number;
};

/** User- and MCP-facing note after a Galley cook / consume_meal. */
export function cookDeductionNote(input: CookFeedbackInput): string {
	const names = formatSkippedIngredientNames(input.skippedIngredients);
	const deductions = input.deductionCount ?? 0;

	if (input.partialCook && names) {
		if (deductions > 0) {
			return `Available ingredients deducted from pantry. Skipped (insufficient stock): ${names}.`;
		}
		return `Marked cooked with no cargo deducted. Insufficient stock for: ${names}.`;
	}
	if (deductions > 0) {
		return "Ingredients have been deducted from your pantry inventory.";
	}
	return "Marked cooked. No cargo deductions were needed.";
}

/** User- and MCP-facing note after manifest consume / consume_manifest_entries. */
export function manifestConsumeNote(
	input: CookFeedbackInput & { consumed?: number },
): string {
	const names = formatSkippedIngredientNames(input.skippedIngredients);
	const deductions = input.deductionCount ?? 0;
	const consumed = input.consumed ?? 0;

	if (input.partialCook && names) {
		if (deductions > 0) {
			return `Marked ${consumed} entr${consumed === 1 ? "y" : "ies"} as eaten. Available ingredients deducted; skipped: ${names}.`;
		}
		return `Marked ${consumed} entr${consumed === 1 ? "y" : "ies"} as eaten with no cargo deducted. Insufficient stock for: ${names}.`;
	}
	if (deductions > 0) {
		return "Ingredients deducted from your pantry inventory.";
	}
	if (consumed > 0) {
		return "Marked as eaten. Cargo unchanged.";
	}
	return "No entries consumed.";
}

/** Short Galley UI copy for partial cook success. */
export function galleyPartialCookDescription(
	skipped: Array<Pick<MissingIngredientDetail, "name">> | undefined,
): string {
	const names = formatSkippedIngredientNames(skipped);
	if (!names) return "Available ingredients deducted from Cargo.";
	return `Available ingredients deducted. Skipped: ${names}.`;
}
