import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { ensureMealPlan, getMealPlan } from "~/lib/manifest.server";
import { MealPlanCreateSchema } from "~/lib/schemas/manifest";
import type { Route } from "./+types/meal-plans";

/**
 * GET /api/meal-plans — Returns the active (singleton) meal plan for the org.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
	const { groupId } = await requireActiveGroup(context, request);

	const plan = await getMealPlan(context.cloudflare.env.DB, groupId);
	return { plan };
}

/**
 * POST /api/meal-plans — Ensures the plan exists (idempotent) or creates a named one.
 */
export async function action({ request, context }: Route.ActionArgs) {
	const { groupId } = await requireActiveGroup(context, request);

	if (request.method !== "POST") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

	try {
		// Body is optional; parse name if provided (for future multi-plan support)
		try {
			const json = await request.json();
			MealPlanCreateSchema.safeParse(json);
		} catch {
			// Body optional
		}

		const plan = await ensureMealPlan(context.cloudflare.env.DB, groupId);
		return { plan };
	} catch (e) {
		return handleApiError(e);
	}
}
