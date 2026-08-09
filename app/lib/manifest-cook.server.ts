/**
 * Dark Cook service — organization-scoped Cargo/preparation mutation.
 * Wired when `nutrition-cook-log-split` is enabled; until then callers use
 * legacy `consumeManifestEntries`.
 */

import type { CargoDeduction } from "~/lib/meals.server";
import type { KitchenEventSource } from "~/lib/schemas/kitchen-events";

export type CookManifestEntriesResult = {
	cooked: number;
	entryIds: string[];
	planId: string;
	deductions: CargoDeduction[];
	eventIds: string[];
	alreadyCookedIds: string[];
	partialCook?: boolean;
	requiresConfirmation?: boolean;
	missingIngredients?: Array<{
		name: string;
		required: number;
		available: number;
		unit: string;
	}>;
};

/**
 * Placeholder: full implementation dual-writes cookedAt/consumedAt and emits
 * `manifest_cooked`. Kept dark behind `nutrition-cook-log-split`.
 */
export async function cookManifestEntries(
	_env: Env,
	_organizationId: string,
	_planId: string,
	_entryIds: string[],
	_options?: {
		confirmInsufficient?: boolean;
		userId?: string | null;
		source?: KitchenEventSource;
	},
): Promise<CookManifestEntriesResult> {
	throw new Error(
		"cookManifestEntries is not enabled — enable nutrition-cook-log-split and deploy the cook service",
	);
}
