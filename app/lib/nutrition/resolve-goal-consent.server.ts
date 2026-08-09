import {
	grantNutritionConsent,
	type NutritionConsentSource,
} from "./consent.server";

/**
 * Resolve stamp time for a nutrition goal upsert.
 * Prefer `consent: true` (server grant) over legacy client `consentAt`.
 */
export async function resolveNutritionGoalConsentAt(
	db: D1Database,
	userId: string,
	source: NutritionConsentSource,
	input: { consent?: boolean; consentAt?: Date },
): Promise<Date> {
	if (input.consent === true) {
		const row = await grantNutritionConsent(db, {
			userId,
			purpose: "goals",
			source,
		});
		return row.grantedAt;
	}
	if (
		input.consentAt instanceof Date &&
		!Number.isNaN(input.consentAt.getTime())
	) {
		return input.consentAt;
	}
	throw new Error("consent or consentAt is required");
}
