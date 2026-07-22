import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "~/db/schema";
import { buildCargoDeductionStatements } from "./cargo-deduction.server";
import { bumpReadinessCacheVersions } from "./readiness-cache.server";
import type { UndoRecord } from "./undo-token.server";

/**
 * Atomically restores cargo and (for manifest consume) clears consumedAt in one D1 batch.
 * Restores both quantity and baseQuantity so display/matching stay consistent.
 */
export async function applyUndoRecord(
	db: D1Database,
	organizationId: string,
	record: Pick<
		UndoRecord,
		"kind" | "deductions" | "manifestEntryIds" | "planId"
	>,
	options?: { kv?: KVNamespace },
): Promise<void> {
	const d1 = drizzle(db, { schema });
	// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types are complex
	const stmts: any[] = await buildCargoDeductionStatements(
		d1,
		organizationId,
		record.deductions,
		{ sign: 1 },
	);

	if (record.kind === "manifest_consume") {
		if (!record.planId || !record.manifestEntryIds?.length) {
			throw new Error("Invalid undo record");
		}

		const [plan] = await d1
			.select({ id: schema.mealPlan.id })
			.from(schema.mealPlan)
			.where(
				and(
					eq(schema.mealPlan.id, record.planId),
					eq(schema.mealPlan.organizationId, organizationId),
				),
			)
			.limit(1);

		if (!plan) {
			throw new Error("Meal plan not found or unauthorized");
		}

		stmts.push(
			d1
				.update(schema.mealPlanEntry)
				.set({ consumedAt: null })
				.where(
					and(
						eq(schema.mealPlanEntry.planId, record.planId),
						inArray(schema.mealPlanEntry.id, record.manifestEntryIds),
					),
				),
		);
	}

	if (stmts.length === 0) return;

	// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types are complex
	await d1.batch(stmts as [any, ...any[]]);

	if (record.deductions.length > 0) {
		await bumpReadinessCacheVersions(options?.kv, organizationId);
	}
}
