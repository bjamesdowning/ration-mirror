import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { addItemsFromMeal } from "~/lib/grocery.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import { AddFromMealSchema } from "~/lib/schemas/grocery";
import type { Route } from "./+types/grocery-lists.$id.from-meal";

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
		const { mealId } = AddFromMealSchema.parse(json);
		const result = await addItemsFromMeal(
			context.cloudflare.env.DB,
			groupId,
			listId,
			mealId,
		);
		return result;
	} catch (e) {
		return handleApiError(e);
	}
}
