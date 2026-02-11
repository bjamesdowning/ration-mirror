import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { deleteMeal, getMeal, updateMeal } from "~/lib/meals.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import { MealSchema } from "~/lib/schemas/meal";
import type { Route } from "./+types/meals.$id";

export async function loader({ request, params, context }: Route.LoaderArgs) {
	const { groupId } = await requireActiveGroup(context, request);
	const { id } = params;
	if (!id) throw data({ error: "Not Found" }, { status: 404 });

	const meal = await getMeal(context.cloudflare.env.DB, groupId, id);
	if (!meal) throw data({ error: "Not Found" }, { status: 404 });

	return { meal };
}

export async function action({ request, params, context }: Route.ActionArgs) {
	const {
		groupId,
		session: { user },
	} = await requireActiveGroup(context, request);
	const { id } = params;
	if (!id) throw data({ error: "Not Found" }, { status: 404 });

	const rateLimitResult = await checkRateLimit(
		context.cloudflare.env.RATION_KV,
		"meal_mutation",
		user.id,
	);
	if (!rateLimitResult.allowed) {
		throw data(
			{ error: "Too many requests. Please try again later." },
			{
				status: 429,
				headers: {
					"Retry-After": rateLimitResult.retryAfter?.toString() || "60",
				},
			},
		);
	}

	try {
		if (request.method === "PUT") {
			const json = await request.json();
			const input = MealSchema.parse(json);
			const meal = await updateMeal(
				context.cloudflare.env.DB,
				groupId,
				id,
				input,
			);
			return { meal };
		}

		if (request.method === "DELETE") {
			await deleteMeal(context.cloudflare.env.DB, groupId, id);
			return { success: true };
		}
	} catch (e) {
		return handleApiError(e);
	}

	return data({ error: "Method not allowed" }, { status: 405 });
}
