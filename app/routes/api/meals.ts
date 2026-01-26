import {
	type ActionFunctionArgs,
	data,
	type LoaderFunctionArgs,
} from "react-router";
import { z } from "zod";
import { requireAuth } from "~/lib/auth.server";
import { createMeal, getMeals } from "~/lib/meals.server";
import { MealSchema } from "~/lib/schemas/meal";

export async function loader({ request, context }: LoaderFunctionArgs) {
	const { user } = await requireAuth(context, request);
	const url = new URL(request.url);
	const tag = url.searchParams.get("tag") || undefined;

	const meals = await getMeals(context.env.DB, user.id, tag);
	return { meals };
}

export async function action({ request, context }: ActionFunctionArgs) {
	const { user } = await requireAuth(context, request);

	if (request.method !== "POST") {
		return data({ error: "Method not allowed" }, { status: 405 });
	}

	try {
		const json = await request.json();
		const input = MealSchema.parse(json);
		const meal = await createMeal(context.env.DB, user.id, input);
		return { meal };
	} catch (e) {
		if (e instanceof z.ZodError) {
			return data(
				{ error: "Validation failed", details: e.issues },
				{ status: 400 },
			);
		}
		console.error(e);
		return data({ error: "Internal Server Error" }, { status: 500 });
	}
}
