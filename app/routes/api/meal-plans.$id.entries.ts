import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import {
	addEntry,
	ensureMealPlan,
	getMealPlanById,
	getWeekEntries,
} from "~/lib/manifest.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import {
	MealPlanEntryCreateSchema,
	WeekQuerySchema,
} from "~/lib/schemas/manifest";
import type { Route } from "./+types/meal-plans.$id.entries";

/**
 * GET /api/meal-plans/:id/entries?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 */
export async function loader({ request, context, params }: Route.LoaderArgs) {
	const { groupId } = await requireActiveGroup(context, request);
	const planId = params.id;
	if (!planId) throw data({ error: "Plan ID required" }, { status: 400 });

	// Row-level security: only return entries for a plan owned by this org
	const plan = await getMealPlanById(
		context.cloudflare.env.DB,
		groupId,
		planId,
	);
	if (!plan) throw data({ error: "Meal plan not found" }, { status: 404 });

	const url = new URL(request.url);
	const parsed = WeekQuerySchema.safeParse({
		startDate: url.searchParams.get("startDate"),
		endDate: url.searchParams.get("endDate"),
	});

	if (!parsed.success) {
		throw data(
			{ error: "Invalid date range", details: parsed.error.flatten() },
			{ status: 400 },
		);
	}

	const entries = await getWeekEntries(
		context.cloudflare.env.DB,
		plan.id,
		parsed.data.startDate,
		parsed.data.endDate,
	);

	return { entries };
}

/**
 * POST /api/meal-plans/:id/entries — Add a meal to a slot.
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
		const input = MealPlanEntryCreateSchema.parse(json);

		// Ensure the plan belongs to this org (auto-create if needed)
		const plan = await ensureMealPlan(context.cloudflare.env.DB, groupId);

		const entry = await addEntry(
			context.cloudflare.env.DB,
			groupId,
			plan.id,
			input,
		);

		return { entry };
	} catch (e) {
		return handleApiError(e);
	}
}
