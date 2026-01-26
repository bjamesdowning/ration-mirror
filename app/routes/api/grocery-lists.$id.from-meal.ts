import type { ActionFunctionArgs } from "react-router";
import { requireAuth } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { addItemsFromMeal } from "~/lib/grocery.server";
import { AddFromMealSchema } from "~/lib/schemas/grocery";

/**
 * POST /api/grocery-lists/:id/from-meal - Add missing meal ingredients to grocery list
 */
export async function action({ request, context, params }: ActionFunctionArgs) {
	const { user } = await requireAuth(context, request);
	const listId = params.id;

	if (!listId) {
		throw new Response("List ID required", { status: 400 });
	}

	if (request.method !== "POST") {
		throw new Response("Method not allowed", { status: 405 });
	}

	try {
		const json = await request.json();
		const { mealId } = AddFromMealSchema.parse(json);
		const result = await addItemsFromMeal(
			context.cloudflare.env.DB,
			user.id,
			listId,
			mealId,
		);
		return result;
	} catch (e) {
		return handleApiError(e);
	}
}
