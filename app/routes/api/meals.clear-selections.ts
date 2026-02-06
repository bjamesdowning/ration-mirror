import { type ActionFunctionArgs, data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { clearMealSelections } from "~/lib/meal-selection.server";

export async function action({ request, context }: ActionFunctionArgs) {
	if (request.method !== "POST") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

	const { groupId } = await requireActiveGroup(context, request);
	const result = await clearMealSelections(context.cloudflare.env.DB, groupId);

	return { success: true, cleared: result.cleared };
}
