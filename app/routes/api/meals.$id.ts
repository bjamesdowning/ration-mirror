import {
	type ActionFunctionArgs,
	data,
	type LoaderFunctionArgs,
} from "react-router";
import { z } from "zod";
import { requireAuth } from "~/lib/auth.server";
import { deleteMeal, getMeal, updateMeal } from "~/lib/meals.server";
import { MealSchema } from "~/lib/schemas/meal";

export async function loader({ request, params, context }: LoaderFunctionArgs) {
	const { user } = await requireAuth(context, request);
	const { id } = params;
	if (!id) throw new Response("Not Found", { status: 404 });

	const meal = await getMeal(context.cloudflare.env.DB, user.id, id);
	if (!meal) throw new Response("Not Found", { status: 404 });

	return { meal };
}

export async function action({ request, params, context }: ActionFunctionArgs) {
	const { user } = await requireAuth(context, request);
	const { id } = params;
	if (!id) throw new Response("Not Found", { status: 404 });

	try {
		if (request.method === "PUT") {
			const json = await request.json();
			const input = MealSchema.parse(json);
			const meal = await updateMeal(
				context.cloudflare.env.DB,
				user.id,
				id,
				input,
			);
			return { meal };
		}

		if (request.method === "DELETE") {
			await deleteMeal(context.cloudflare.env.DB, user.id, id);
			return { success: true };
		}
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

	return data({ error: "Method not allowed" }, { status: 405 });
}
