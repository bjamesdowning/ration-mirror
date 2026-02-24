import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { getMealPlanById } from "~/lib/manifest.server";
import type { Route } from "./+types/meal-plans.$id";

/**
 * GET /api/meal-plans/:id — Returns plan metadata.
 */
export async function loader({ request, context, params }: Route.LoaderArgs) {
	const { groupId } = await requireActiveGroup(context, request);
	const planId = params.id;

	if (!planId) throw data({ error: "Plan ID required" }, { status: 400 });

	const plan = await getMealPlanById(
		context.cloudflare.env.DB,
		groupId,
		planId,
	);

	if (!plan) throw data({ error: "Meal plan not found" }, { status: 404 });
	return { plan };
}
