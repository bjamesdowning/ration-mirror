import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { cookMeal } from "~/lib/meals.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import type { Route } from "./+types/meals.$id.cook";

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
			{ status: 429, headers: { "Retry-After": "60" } },
		);
	}

	if (request.method !== "POST") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

	try {
		const result = await cookMeal(context.cloudflare.env.DB, groupId, id);
		return { result };
	} catch (e) {
		return handleApiError(e);
	}
}
