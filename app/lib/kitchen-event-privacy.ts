/**
 * Shared kitchen-event payloads must never expose personal nutrition (kcal,
 * plate-up servings, verified). Those live only on user-scoped nutrition_intake.
 */

/** Keys stripped from org-shared event payloads (new writes + readers + purge). */
export const PERSONAL_NUTRITION_PAYLOAD_KEYS = [
	"energyKcal",
	"portionServings",
	"verified",
	"manifestDate",
] as const;

export type PersonalNutritionPayloadKey =
	(typeof PERSONAL_NUTRITION_PAYLOAD_KEYS)[number];

export function hasPersonalNutritionPayloadFields(
	payload: Record<string, unknown> | null | undefined,
): boolean {
	if (!payload) return false;
	return PERSONAL_NUTRITION_PAYLOAD_KEYS.some((key) => key in payload);
}

/**
 * Returns a shallow copy with personal nutrition fields removed.
 * Idempotent — safe for readers and purge backfills.
 */
export function redactPersonalNutritionFromPayload(
	payload: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
	if (!payload) return {};
	const next = { ...payload };
	for (const key of PERSONAL_NUTRITION_PAYLOAD_KEYS) {
		delete next[key];
	}
	return next;
}
