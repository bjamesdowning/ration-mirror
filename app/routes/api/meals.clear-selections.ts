import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { clearMealSelections } from "~/lib/meal-selection.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import type { Route } from "./+types/meals.clear-selections";

export async function action({ request, context }: Route.ActionArgs) {
	if (request.method !== "POST") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

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

	const result = await clearMealSelections(context.cloudflare.env.DB, groupId);

	return { success: true, cleared: result.cleared };
}
