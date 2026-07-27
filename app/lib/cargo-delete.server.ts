/**
 * Clear supply_item.source_cargo_id before deleting cargo rows that must remain
 * linked to surviving supply lists (jettison / merge). Org wipe deletes
 * supply_list first (cascading items) and relies on ON DELETE SET NULL
 * (migration 0039) as defense in depth.
 */

import { inArray } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "~/db/schema";
import { chunkArray, D1_SAFE_BOUND_PARAMS } from "~/lib/query-utils.server";

type Db = DrizzleD1Database<typeof schema> | DrizzleD1Database;

/**
 * Nulls supply_item.source_cargo_id for the given cargo IDs (chunked for D1).
 * Call before any DELETE FROM cargo when supply rows may still reference them.
 */
export async function clearSupplyItemCargoRefs(
	db: Db,
	cargoIds: string[],
): Promise<void> {
	if (cargoIds.length === 0) return;

	for (const chunk of chunkArray(cargoIds, D1_SAFE_BOUND_PARAMS)) {
		await db
			.update(schema.supplyItem)
			.set({ sourceCargoId: null })
			.where(inArray(schema.supplyItem.sourceCargoId, chunk));
	}
}
