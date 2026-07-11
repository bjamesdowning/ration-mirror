import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { data } from "react-router";
import type { z } from "zod";
import * as schema from "~/db/schema";
import {
	chunkArray,
	D1_MAX_PLAN_ENTRY_ROWS_PER_STATEMENT,
} from "~/lib/query-utils.server";
import type { BulkEntryCreateSchema } from "~/lib/schemas/manifest";

export type BulkEntryInput = z.infer<typeof BulkEntryCreateSchema>;

export class ManifestBulkSubmissionError extends Error {
	constructor(
		message: string,
		readonly status: 403 | 404,
	) {
		super(message);
		this.name = "ManifestBulkSubmissionError";
	}
}

export async function insertManifestBulkEntries(
	db: D1Database,
	organizationId: string,
	planId: string,
	input: BulkEntryInput,
) {
	const { entries: inputEntries } = input;
	const drizzleDb = drizzle(db, { schema });

	const planRows = await drizzleDb
		.select({ id: schema.mealPlan.id })
		.from(schema.mealPlan)
		.where(
			and(
				eq(schema.mealPlan.id, planId),
				eq(schema.mealPlan.organizationId, organizationId),
				eq(schema.mealPlan.isArchived, false),
			),
		)
		.limit(1);

	if (!planRows[0]) {
		throw new ManifestBulkSubmissionError("Meal plan not found", 404);
	}

	const mealIds = [...new Set(inputEntries.map((e) => e.mealId))];
	const validMeals = await drizzleDb
		.select({ id: schema.meal.id })
		.from(schema.meal)
		.where(
			and(
				eq(schema.meal.organizationId, organizationId),
				inArray(schema.meal.id, mealIds),
			),
		)
		.limit(50);

	const validMealIds = new Set(validMeals.map((m) => m.id));
	const unauthorizedMeal = inputEntries.find(
		(e) => !validMealIds.has(e.mealId),
	);
	if (unauthorizedMeal) {
		throw new ManifestBulkSubmissionError(
			"One or more meals not found or unauthorized",
			403,
		);
	}

	const rows = inputEntries.map((e) => ({
		id: crypto.randomUUID(),
		planId: planRows[0].id,
		mealId: e.mealId,
		date: e.date,
		slotType: e.slotType,
		orderIndex: e.orderIndex ?? 0,
		servingsOverride: e.servingsOverride ?? null,
		notes: e.notes ?? null,
	}));

	const insertStatements = chunkArray(
		rows,
		D1_MAX_PLAN_ENTRY_ROWS_PER_STATEMENT,
	).map((chunk) => drizzleDb.insert(schema.mealPlanEntry).values(chunk));

	// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types are complex
	await drizzleDb.batch(insertStatements as [any, ...any[]]);

	return {
		inserted: rows.length,
		entries: rows.map((row) => ({
			entryId: row.id,
			mealId: row.mealId,
			date: row.date,
			slotType: row.slotType,
		})),
	};
}

export async function submitManifestBulkEntries(
	db: D1Database,
	organizationId: string,
	planId: string,
	input: BulkEntryInput,
) {
	try {
		const result = await insertManifestBulkEntries(
			db,
			organizationId,
			planId,
			input,
		);
		return { inserted: result.inserted };
	} catch (error) {
		if (error instanceof ManifestBulkSubmissionError) {
			throw data({ error: error.message }, { status: error.status });
		}
		throw error;
	}
}
