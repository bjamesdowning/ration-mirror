import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { data } from "react-router";
import * as schema from "~/db/schema";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import { BulkEntryCreateSchema } from "~/lib/schemas/manifest";
import type { Route } from "./+types/meal-plans.$id.entries.bulk";

/**
 * POST /api/meal-plans/:id/entries/bulk
 *
 * Generic bulk-insert endpoint used by:
 *   - "Copy Entry" — client constructs entries from a single source entry × N target dates
 *   - "Copy Day"   — client constructs entries from all source-day entries × N target dates
 *   - Future AI    — AI planner POSTs an identical payload with LLM-generated entries
 *
 * Contract: { entries: Array<{ mealId, date, slotType, orderIndex?, servingsOverride?, notes? }> }
 * Max 50 entries per request (matches ConsumeEntriesRequestSchema ceiling).
 */
export async function action({ request, context, params }: Route.ActionArgs) {
	const {
		groupId,
		session: { user },
	} = await requireActiveGroup(context, request);

	const planId = params.id;
	if (!planId) throw data({ error: "Plan ID required" }, { status: 400 });

	if (request.method !== "POST") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

	// Rate limit — reuses the grocery_mutation bucket (same tier as single-add)
	const rateLimitResult = await checkRateLimit(
		context.cloudflare.env.RATION_KV,
		"grocery_mutation",
		user.id,
	);
	if (!rateLimitResult.allowed) {
		throw data(
			{ error: "Too many requests. Please try again later." },
			{ status: 429, headers: { "Retry-After": "60" } },
		);
	}

	try {
		const json = await request.json();
		const { entries: inputEntries } = BulkEntryCreateSchema.parse(json);

		const db = drizzle(context.cloudflare.env.DB, { schema });

		// RLS: confirm the URL plan ID exists and belongs to this org
		const planRows = await db
			.select({ id: schema.mealPlan.id })
			.from(schema.mealPlan)
			.where(
				and(
					eq(schema.mealPlan.id, planId),
					eq(schema.mealPlan.organizationId, groupId),
					eq(schema.mealPlan.isArchived, false),
				),
			)
			.limit(1);

		if (!planRows[0]) {
			throw data({ error: "Meal plan not found" }, { status: 404 });
		}

		// Verify all referenced meals belong to this org in one query (capped at schema max of 50)
		const mealIds = [...new Set(inputEntries.map((e) => e.mealId))];
		const validMeals = await db
			.select({ id: schema.meal.id })
			.from(schema.meal)
			.where(
				and(
					eq(schema.meal.organizationId, groupId),
					inArray(schema.meal.id, mealIds),
				),
			)
			.limit(50);

		const validMealIds = new Set(validMeals.map((m) => m.id));
		const unauthorizedMeal = inputEntries.find(
			(e) => !validMealIds.has(e.mealId),
		);
		if (unauthorizedMeal) {
			throw data(
				{ error: "One or more meals not found or unauthorized" },
				{ status: 403 },
			);
		}

		// Single bulk INSERT — O(1) round-trips regardless of entry count
		const rows = inputEntries.map((e) => ({
			planId: planRows[0].id,
			mealId: e.mealId,
			date: e.date,
			slotType: e.slotType,
			orderIndex: e.orderIndex ?? 0,
			servingsOverride: e.servingsOverride ?? null,
			notes: e.notes ?? null,
		}));

		await db.insert(schema.mealPlanEntry).values(rows);

		return { inserted: rows.length };
	} catch (e) {
		return handleApiError(e);
	}
}
