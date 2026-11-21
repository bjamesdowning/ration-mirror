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

export type HealthEditChange = {
	nutrientsChanged: boolean;
	occurredAtChanged: boolean;
	nameChanged: boolean;
};

/**
 * The healthSyncVersion an edited line carries. HealthKit only replaces a
 * sample when its sync version rises, so any change Health shows (amounts,
 * time, or food name) must bump it. A notes-only or tag-only edit does not.
 */
export function healthSyncVersionAfterEdit(
	currentVersion: number | null | undefined,
	change: HealthEditChange,
): number {
	const base = currentVersion ?? 1;
	return change.nutrientsChanged ||
		change.occurredAtChanged ||
		change.nameChanged
		? base + 1
		: base;
}

/**
 * The composition stamp an edited line carries. An edit that leaves the
 * amounts alone keeps the original source and confirmation, so an AI
 * estimate stays out of Health. An edit that changes the amounts means the
 * person typed them: that is a confirmed user override, unless the request
 * names a saved food or another source.
 */
export function editCompositionStamp(input: {
	current: {
		compositionSource: string | null;
		compositionConfirmedAt: Date | null;
	};
	nutrientsChanged: boolean;
	requestedSource: string | null | undefined;
	savedFood: boolean;
	now: Date;
}): { compositionSource: string; compositionConfirmedAt: Date | null } {
	if (!input.nutrientsChanged && input.current.compositionSource) {
		return {
			compositionSource: input.current.compositionSource,
			compositionConfirmedAt: input.current.compositionConfirmedAt ?? null,
		};
	}
	if (!input.nutrientsChanged) {
		return diaryCompositionStamp(input.requestedSource, input.now);
	}
	return diaryCompositionStamp(
		input.savedFood
			? "manual_macros"
			: (input.requestedSource ?? "user_override"),
		input.now,
	);
}
