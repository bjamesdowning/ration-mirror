import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { createMeal, getMeals } from "~/lib/meals.server";
import { MealSchema } from "~/lib/schemas/meal";

export async function loader({ request, context }: LoaderFunctionArgs) {
	const { groupId } = await requireActiveGroup(context, request);
	const url = new URL(request.url);
	const tag = url.searchParams.get("tag") || undefined;

	const meals = await getMeals(context.cloudflare.env.DB, groupId, tag);
	return { meals };
}

export async function action({ request, context }: ActionFunctionArgs) {
	const { groupId } = await requireActiveGroup(context, request);

	if (request.method !== "POST") {
		throw new Response("Method not allowed", { status: 405 });
	}

	try {
		const json = await request.json();
		const input = MealSchema.parse(json);
		const meal = await createMeal(context.cloudflare.env.DB, groupId, input);
		return { meal };
	} catch (e) {
		return handleApiError(e);
	}
}
