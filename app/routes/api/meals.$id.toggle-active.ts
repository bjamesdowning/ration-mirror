import { type ActionFunctionArgs, data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import {
	toggleMealSelection,
	validateMealOwnership,
} from "~/lib/meal-selection.server";

export async function action({ request, context, params }: ActionFunctionArgs) {
	const { groupId } = await requireActiveGroup(context, request);
	const mealId = params.id;

	if (!mealId) {
		throw data({ error: "Missing meal ID" }, { status: 400 });
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
