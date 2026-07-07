import { data } from "react-router";
import { handleApiError } from "~/lib/error-handler";
import { clearMealSelections } from "~/lib/meal-selection.server";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import type { Route } from "./+types/v1.meals.clear-selections";

export async function action({ request, context }: Route.ActionArgs) {
	if (request.method !== "POST") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

	try {
		const { userId, organizationId } = await requireMobileActiveGroup(
			context,
			request,
		);

		const rateLimitResult = await checkRateLimit(
			context.cloudflare.env.RATION_KV,
			"meal_mutation",
			userId,
		);
		if (!rateLimitResult.allowed) {
			throw rateLimitResponse(
				rateLimitResult,
				"Too many requests. Please try again later.",
			);
		}

		const result = await clearMealSelections(
			context.cloudflare.env.DB,
			organizationId,
		);

		return { success: true, cleared: result.cleared };
	} catch (e) {
		return handleApiError(e);
	}
}
