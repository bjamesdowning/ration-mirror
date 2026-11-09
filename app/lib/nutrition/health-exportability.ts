const EXPORTABLE_SOURCES = new Set([
	"usda",
	"user_override",
	"manual_macros",
	"barcode",
]);

/**
 * Health may export a confirmed USDA, override, manual, or barcode line.
 * An AI estimate fails even when a timestamp is present. Meal rows fail
 * until a later classifier says otherwise.
 */
export function healthExportAllowed(line: {
	compositionSource: string | null | undefined;
	compositionConfirmedAt?: Date | string | number | null;
}): boolean {
	if (line.compositionSource === "ai_estimate") return false;
	if (
		!line.compositionSource ||
		!EXPORTABLE_SOURCES.has(line.compositionSource)
	) {
		return false;
	}
	return line.compositionConfirmedAt != null;
}

export function diaryCompositionStamp(
	source: string | null | undefined,
	now: Date,
): { compositionSource: string; compositionConfirmedAt: Date | null } {
	const compositionSource = source ?? "manual_macros";
	if (
		!healthExportAllowed({ compositionSource, compositionConfirmedAt: now })
	) {
		return { compositionSource, compositionConfirmedAt: null };
	}
	return { compositionSource, compositionConfirmedAt: now };
}
