/**
 * Pure Manifest slot helpers — safe on client and server.
 */

import { SLOT_TYPES, type SlotType } from "~/lib/schemas/manifest";

/**
 * Infer breakfast / lunch / dinner / snack from a local hour (0–23).
 * Used by Galley Cook→Manifest and Add to Manifest defaults.
 */
export function inferSlotTypeFromLocalHour(localHour: number): SlotType {
	const hour = Number.isFinite(localHour)
		? Math.min(23, Math.max(0, Math.floor(localHour)))
		: 18;
	if (hour >= 5 && hour < 10) return "breakfast";
	if (hour >= 10 && hour < 15) return "lunch";
	if (hour >= 15 && hour < 21) return "dinner";
	return "snack";
}

export function isSlotType(value: string): value is SlotType {
	return (SLOT_TYPES as readonly string[]).includes(value);
}

/** Resolve slot: explicit → inferred from localHour → dinner. */
export function resolveManifestSlotType(input: {
	slotType?: string | null;
	localHour?: number | null;
}): SlotType {
	if (input.slotType && isSlotType(input.slotType)) {
		return input.slotType;
	}
	if (input.localHour != null && Number.isFinite(input.localHour)) {
		return inferSlotTypeFromLocalHour(input.localHour);
	}
	return "dinner";
}
