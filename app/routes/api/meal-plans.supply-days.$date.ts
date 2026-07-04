import { data } from "react-router";
import { z } from "zod";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { toggleManifestDaySupply } from "~/lib/manifest-supply.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import type { Route } from "./+types/meal-plans.supply-days.$date";

const DateParamSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * POST /api/meal-plans/supply-days/:date — toggle whether a manifest day
 * contributes ingredient demand to Supply sync.
 */
export async function action({ request, context, params }: Route.ActionArgs) {
	const {
		groupId,
		session: { user },
	} = await requireActiveGroup(context, request);

	if (request.method !== "POST") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

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

	const dateResult = DateParamSchema.safeParse(params.date);
	if (!dateResult.success) {
		throw data({ error: "Invalid date" }, { status: 400 });
	}

	try {
		const result = await toggleManifestDaySupply(
			context.cloudflare.env.DB,
			groupId,
			dateResult.data,
		);
		return result;
	} catch (e) {
		return handleApiError(e);
	}
}
