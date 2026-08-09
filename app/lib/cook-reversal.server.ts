import { and, eq, inArray, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "~/db/schema";
import { buildCargoDeductionStatements } from "./cargo-deduction.server";
import { buildKitchenEventDeleteStmts } from "./kitchen-events.server";
import { bumpReadinessCacheVersions } from "./readiness-cache.server";
import type { UndoRecord } from "./undo-token.server";

/**
 * Atomically restores cargo and/or personal intake state for an undo token.
 *
 * - `cook` (Galley): restore cargo + delete kitchen events
 * - `manifest_consume` (legacy): restore cargo, clear consumedAt, delete intake + events
 * - `manifest_cook`: restore cargo, clear cookedAt/cookedByUserId/consumedAt, delete events;
 *   never touches nutrition_intake. Optionally deletes auto-created entries
 *   listed in `deleteManifestEntryIds`.
 * - `manifest_intake`: void the new personal row and optionally restore the replaced row;
 *   never restores Cargo or clears Prepared state
 */
export async function applyUndoRecord(
	db: D1Database,
	organizationId: string,
	record: Pick<
		UndoRecord,
		| "kind"
		| "deductions"
		| "manifestEntryIds"
		| "deleteManifestEntryIds"
		| "planId"
		| "eventIds"
		| "userId"
		| "intakeIds"
		| "restoreIntakeId"
		| "operationId"
	>,
	options?: { kv?: KVNamespace },
): Promise<void> {
	const d1 = drizzle(db, { schema });
	// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types are complex
	const stmts: any[] = [];

	if (record.kind !== "manifest_intake" && record.deductions.length > 0) {
		stmts.push(
			...(await buildCargoDeductionStatements(
				d1,
				organizationId,
				record.deductions,
				{ sign: 1 },
			)),
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

		// Legacy combined consume: reverse private intake for this user.
		if (record.intakeIds?.length) {
			stmts.push(
				d1
					.delete(schema.nutritionIntake)
					.where(
						and(
							eq(schema.nutritionIntake.userId, record.userId),
							eq(schema.nutritionIntake.organizationId, organizationId),
							inArray(schema.nutritionIntake.id, record.intakeIds),
						),
					),
			);
		} else if (record.eventIds?.length) {
			stmts.push(
				d1
					.delete(schema.nutritionIntake)
					.where(
						and(
							eq(schema.nutritionIntake.userId, record.userId),
							eq(schema.nutritionIntake.organizationId, organizationId),
							inArray(schema.nutritionIntake.kitchenEventId, record.eventIds),
						),
					),
			);
		}
	}

	if (record.kind === "manifest_cook") {
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

		const toDelete = new Set(record.deleteManifestEntryIds ?? []);
		const toClear = record.manifestEntryIds.filter((id) => !toDelete.has(id));

		if (toClear.length > 0) {
			stmts.push(
				d1
					.update(schema.mealPlanEntry)
					.set({
						cookedAt: null,
						cookedByUserId: null,
						consumedAt: null,
					})
					.where(
						and(
							eq(schema.mealPlanEntry.planId, record.planId),
							inArray(schema.mealPlanEntry.id, toClear),
						),
					),
			);
		}

		if (toDelete.size > 0) {
			stmts.push(
				d1
					.delete(schema.mealPlanEntry)
					.where(
						and(
							eq(schema.mealPlanEntry.planId, record.planId),
							inArray(schema.mealPlanEntry.id, [...toDelete]),
						),
					),
			);
		}
		// Intentionally does NOT touch nutrition_intake — other members' Eat rows stay.
	}

	if (record.kind === "manifest_intake") {
		if (!record.operationId) {
			throw new Error("Invalid nutrition undo record");
		}
		const now = new Date();
		if (record.intakeIds?.length) {
			stmts.push(
				d1
					.update(schema.nutritionIntake)
					.set({ voidedAt: now, voidedByUserId: record.userId })
					.where(
						and(
							eq(schema.nutritionIntake.userId, record.userId),
							eq(schema.nutritionIntake.organizationId, organizationId),
							eq(schema.nutritionIntake.operationId, record.operationId),
							inArray(schema.nutritionIntake.id, record.intakeIds),
							isNull(schema.nutritionIntake.voidedAt),
						),
					),
			);
		}
		if (record.restoreIntakeId) {
			stmts.push(
				d1
					.update(schema.nutritionIntake)
					.set({
						voidedAt: null,
						voidedByUserId: null,
						voidOperationId: null,
					})
					.where(
						and(
							eq(schema.nutritionIntake.id, record.restoreIntakeId),
							eq(schema.nutritionIntake.userId, record.userId),
							eq(schema.nutritionIntake.organizationId, organizationId),
							eq(schema.nutritionIntake.voidOperationId, record.operationId),
						),
					),
			);
		}
	}

	if (record.kind !== "manifest_intake" && record.eventIds?.length) {
		stmts.push(
			...buildKitchenEventDeleteStmts(d1, organizationId, record.eventIds),
		);
	}

	if (stmts.length === 0) return;

	// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types are complex
	await d1.batch(stmts as [any, ...any[]]);

	if (record.kind !== "manifest_intake" && record.deductions.length > 0) {
		await bumpReadinessCacheVersions(options?.kv, organizationId);
	}
}
