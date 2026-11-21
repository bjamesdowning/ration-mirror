const EXPORTABLE_SOURCES = new Set([
	"usda",
	"user_override",
	"manual_macros",
	"barcode",
]);

/**
 * The rule iOS 1.6.39 and 1.6.40 still get: a confirmed USDA, override,
 * manual, or barcode line. An AI estimate fails even when a timestamp is
 * present, and meal rows fail. Newer clients export every usable Fuel log
 * (see `healthSampleUsable`); this rule also still decides the
 * informational `compositionConfirmedAt` stamp.
 */
export function legacyHealthExportAllowed(line: {
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

/** Older name for `legacyHealthExportAllowed`. */
export const healthExportAllowed = legacyHealthExportAllowed;

/** Most energy one Fuel log may send to Health. */
export const HEALTH_SAMPLE_MAX_KCAL = 5000;
/** Most protein, carbs, or fat one Fuel log may send to Health. */
export const HEALTH_SAMPLE_MAX_MACRO_G = 500;
/** Most fiber one Fuel log may send to Health. */
export const HEALTH_SAMPLE_MAX_FIBER_G = 200;

function finiteInRange(value: unknown, max: number): value is number {
	return (
		typeof value === "number" &&
		Number.isFinite(value) &&
		value >= 0 &&
		value <= max
	);
}

/**
 * True when a Fuel log has numbers Apple Health can hold. Energy must be
 * above 0 (a 0 often means "unknown") and every macro present and in range.
 * Fiber may be missing. The Atwater check (4p + 4c + 9f within 3x the
 * calories plus 100) drops numbers that cannot describe the same food.
 */
export function healthSampleUsable(line: {
	energyKcal: number | null | undefined;
	proteinG: number | null | undefined;
	carbsG: number | null | undefined;
	fatG: number | null | undefined;
	fiberG?: number | null | undefined;
}): boolean {
	const kcal = line.energyKcal;
	if (!finiteInRange(kcal, HEALTH_SAMPLE_MAX_KCAL) || kcal <= 0) return false;
	const { proteinG, carbsG, fatG } = line;
	if (
		!finiteInRange(proteinG, HEALTH_SAMPLE_MAX_MACRO_G) ||
		!finiteInRange(carbsG, HEALTH_SAMPLE_MAX_MACRO_G) ||
		!finiteInRange(fatG, HEALTH_SAMPLE_MAX_MACRO_G)
	) {
		return false;
	}
	if (
		line.fiberG != null &&
		!finiteInRange(line.fiberG, HEALTH_SAMPLE_MAX_FIBER_G)
	) {
		return false;
	}
	return 4 * proteinG + 4 * carbsG + 9 * fatG <= 3 * kcal + 100;
}

export function diaryCompositionStamp(
	source: string | null | undefined,
	now: Date,
): { compositionSource: string; compositionConfirmedAt: Date | null } {
	const compositionSource = source ?? "manual_macros";
	if (
		!legacyHealthExportAllowed({
			compositionSource,
			compositionConfirmedAt: now,
		})
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
 * estimate keeps its estimate marker in Health. An edit that changes the amounts means the
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
