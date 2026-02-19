import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { checkCapacity } from "~/lib/capacity.server";
import { handleApiError } from "~/lib/error-handler";
import { createMeal, getMeals } from "~/lib/meals.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import { MealSchema } from "~/lib/schemas/meal";
import type { Route } from "./+types/meals";

export async function loader({ request, context }: Route.LoaderArgs) {
	const { groupId } = await requireActiveGroup(context, request);
	const url = new URL(request.url);
	const tag = url.searchParams.get("tag") || undefined;

	const meals = await getMeals(context.cloudflare.env.DB, groupId, tag);
	return { meals };
}

export async function action({ request, context }: Route.ActionArgs) {
	const {
		groupId,
		session: { user },
	} = await requireActiveGroup(context, request);

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

	if (request.method !== "POST") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

	try {
		const json = await request.json();
		const input = MealSchema.parse(json);

		const capacity = await checkCapacity(
			context.cloudflare.env,
			groupId,
			"meals",
			1,
		);
		if (!capacity.allowed) {
			return data(
				{
					error: "capacity_exceeded",
					resource: "meals",
					current: capacity.current,
					limit: capacity.limit,
					tier: capacity.tier,
					isExpired: capacity.isExpired,
					canAdd: capacity.canAdd,
					upgradePath: "crew_member",
				},
				{ status: 403 },
			);
		}

		const meal = await createMeal(context.cloudflare.env.DB, groupId, input);
		return { meal };
	} catch (e) {
		return handleApiError(e);
	}
}
