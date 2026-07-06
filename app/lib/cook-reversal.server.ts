import { and, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "~/db/schema";
import type { UndoRecord } from "./undo-token.server";

/**
 * Atomically restores cargo and (for manifest consume) clears consumedAt in one D1 batch.
 */
export async function applyUndoRecord(
	db: D1Database,
	organizationId: string,
	record: Pick<
		UndoRecord,
		"kind" | "deductions" | "manifestEntryIds" | "planId"
	>,
): Promise<void> {
	const d1 = drizzle(db, { schema });
	// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types are complex
	const stmts: any[] = [];

	for (const deduction of record.deductions) {
		stmts.push(
			d1
				.update(schema.cargo)
				.set({
					quantity: sql`${schema.cargo.quantity} + ${deduction.quantity}`,
				})
				.where(
					and(
						eq(schema.cargo.id, deduction.cargoId),
						eq(schema.cargo.organizationId, organizationId),
					),
				),
		);
	}

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
}
