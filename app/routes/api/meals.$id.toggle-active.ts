import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import {
	toggleMealSelection,
	validateMealOwnership,
} from "~/lib/meal-selection.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import type { Route } from "./+types/meals.$id.toggle-active";

export async function action({ request, context, params }: Route.ActionArgs) {
	const {
		groupId,
		session: { user },
	} = await requireActiveGroup(context, request);
	const mealId = params.id;

	if (!mealId) {
		throw data({ error: "Missing meal ID" }, { status: 400 });
	}

	const rateLimitResult = await checkRateLimit(
		context.cloudflare.env.RATION_KV,
		"meal_mutation",
		user.id,
	);
	if (!rateLimitResult.allowed) {
		throw data(
			{ error: "Too many requests. Please try again later." },
			{ status: 429, headers: { "Retry-After": "60" } },
		);
	}

	const isOwned = await validateMealOwnership(
		context.cloudflare.env.DB,
		groupId,
		mealId,
	);

	if (!isOwned) {
		throw data({ error: "Meal not found or unauthorized" }, { status: 404 });
	}

	const result = await toggleMealSelection(
		context.cloudflare.env.DB,
		groupId,
		mealId,
	);

	return { success: true, mealId, ...result };
}
