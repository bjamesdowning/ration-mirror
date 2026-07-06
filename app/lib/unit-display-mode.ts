import type { UserSettings } from "./types";
import type { SupplyUnitMode } from "./units";

/** Global quantity display mode across Cargo, Galley, Supply, and Manifest. */
export type UnitDisplayMode = "original" | SupplyUnitMode;

export const UNIT_DISPLAY_MODES: UnitDisplayMode[] = [
	"original",
	"metric",
	"imperial",
	"cooking",
];

export const UNIT_DISPLAY_MODE_LABELS: Record<UnitDisplayMode, string> = {
	original: "Original",
	metric: "Metric",
	imperial: "Imperial",
	cooking: "Cooking",
};

/**
 * Resolves the active unit display mode from user settings.
 * Migrates legacy `supplyUnitMode` when `unitDisplayMode` is unset.
 */
export function resolveUnitDisplayMode(
	settings: UserSettings | null | undefined,
): UnitDisplayMode {
	const mode = settings?.unitDisplayMode;
	if (
		mode === "original" ||
		mode === "metric" ||
		mode === "imperial" ||
		mode === "cooking"
	) {
		return mode;
	}
	const legacy = settings?.supplyUnitMode;
	if (legacy === "metric" || legacy === "imperial" || legacy === "cooking") {
		return legacy;
	}
	return "metric";
}

/** Supply sync uses metric/imperial/cooking transforms; original keeps readable base units. */
export function toSupplySyncMode(
	mode: UnitDisplayMode,
): SupplyUnitMode | "original" {
	if (mode === "original") return "original";
	return mode;
}
