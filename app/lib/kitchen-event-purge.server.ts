import { eq, inArray } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/d1";
import { kitchenEvent } from "~/db/schema";
import {
	hasPersonalNutritionPayloadFields,
	redactPersonalNutritionFromPayload,
} from "./kitchen-event-privacy";
import { chunkArray } from "./query-utils.server";

type DrizzleD1 = ReturnType<typeof drizzle>;

const PURGE_EVENT_FETCH_CAP = 5000;
const PURGE_EVENT_UPDATE_BATCH = 40;

/**
 * Strip personal nutrition fields from kitchen_event payloads for a user
 * before anonymizing (userId → null). Idempotent; returns counts only —
 * never logs payload contents.
 */
export async function redactAllNutritionPayloadsForUser(
	d1: DrizzleD1,
	userId: string,
	options?: { maxRows?: number },
): Promise<{ scanned: number; updated: number }> {
	const maxRows = options?.maxRows ?? PURGE_EVENT_FETCH_CAP;
	const rows = await d1
		.select({
			id: kitchenEvent.id,
			payload: kitchenEvent.payload,
		})
		.from(kitchenEvent)
		.where(eq(kitchenEvent.userId, userId))
		.limit(maxRows);

	const dirty = rows.filter((row) =>
		hasPersonalNutritionPayloadFields(
			(row.payload ?? {}) as Record<string, unknown>,
		),
	);

	if (dirty.length === 0) {
		return { scanned: rows.length, updated: 0 };
	}

	for (const chunk of chunkArray(dirty, PURGE_EVENT_UPDATE_BATCH)) {
		// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types are complex
		const stmts: any[] = chunk.map((row) =>
			d1
				.update(kitchenEvent)
				.set({
					payload: redactPersonalNutritionFromPayload(
						(row.payload ?? {}) as Record<string, unknown>,
					),
				})
				.where(inArray(kitchenEvent.id, [row.id])),
		);
		// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types are complex
		await d1.batch(stmts as [any, ...any[]]);
	}

	return { scanned: rows.length, updated: dirty.length };
}
