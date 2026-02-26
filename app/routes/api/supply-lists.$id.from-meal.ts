import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import { AddFromMealSchema } from "~/lib/schemas/supply";
import { addItemsFromMeal } from "~/lib/supply.server";
import type { Route } from "./+types/supply-lists.$id.from-meal";

/**
 * POST /api/grocery-lists/:id/from-meal - Add missing meal ingredients to grocery list
 */
export async function action({ request, context, params }: Route.ActionArgs) {
	const {
		groupId,
		session: { user },
	} = await requireActiveGroup(context, request);
	const listId = params.id;

	if (!listId) {
		throw data({ error: "List ID required" }, { status: 400 });
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

	if (request.method !== "POST") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

	try {
		const json = await request.json();
		const { mealId, servings } = AddFromMealSchema.parse(json);
		const result = await addItemsFromMeal(
			context.cloudflare.env,
			groupId,
			listId,
			mealId,
			{ servings },
		);
		return result;
	} catch (e) {
		return handleApiError(e);
	}
}
