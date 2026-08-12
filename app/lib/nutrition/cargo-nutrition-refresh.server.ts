import { getCargoItem, updateItem } from "~/lib/cargo.server";
import type { FlagshipEvaluationContext } from "~/lib/feature-flags/context.server";
import { toSupportedUnit } from "~/lib/units";
import {
	type NutritionSnapshotDto,
	serializeNutritionSnapshot,
} from "./dto.server";
import { maybeResolveCargoNutrition } from "./persist.server";
import type { NutritionSnapshot } from "./types";

export const CARGO_NUTRITION_REFRESH_NONE_FOUND =
	"No USDA match found. Enter nutrients manually.";

export type RefreshCargoNutritionResult = {
	matched: boolean;
	nutrition: NutritionSnapshotDto | null;
	message?: string;
	item: Awaited<ReturnType<typeof updateItem>>;
};

/**
 * USDA-only nutrition rematch for an existing cargo row.
 * Uses the server-side item name (never client-supplied). Persists a USDA
 * snapshot when matched; clears nutrition to null on miss.
 */
export async function refreshCargoNutritionFromUsda(
	env: Env,
	organizationId: string,
	cargoId: string,
	flagContext: FlagshipEvaluationContext,
	opts: { userId: string },
): Promise<RefreshCargoNutritionResult | null> {
	const existing = await getCargoItem(env.DB, organizationId, cargoId);
	if (!existing) return null;

	const snapshot = await maybeResolveCargoNutrition(
		env,
		existing.name,
		flagContext,
		{
			allowAiEstimate: false,
			quantity: existing.quantity,
			unit: toSupportedUnit(existing.unit) ?? null,
			organizationId,
			userId: opts.userId,
		},
	);

	const nextNutrition: NutritionSnapshot | null = snapshot;
	const updated = await updateItem(
		env,
		organizationId,
		cargoId,
		{},
		{
			userId: opts.userId,
			flagContext,
			setNutrition: nextNutrition,
		},
	);

	if (!updated) return null;

	const stored = (updated.nutrition as NutritionSnapshot | null) ?? null;
	const matched = stored != null && stored.source === "usda";
	return {
		matched,
		nutrition: stored ? serializeNutritionSnapshot(stored) : null,
		message: matched ? undefined : CARGO_NUTRITION_REFRESH_NONE_FOUND,
		item: updated,
	};
}
