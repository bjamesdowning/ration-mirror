import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { assertFeatureEnabled } from "~/lib/feature-flags/assert-enabled.server";
import { buildWebFlagContext } from "~/lib/feature-flags/context.server";
import { refreshCargoNutritionFromUsda } from "~/lib/nutrition/cargo-nutrition-refresh.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import type { Route } from "./+types/cargo.$id.nutrition.refresh";

/**
 * POST /api/cargo/:id/nutrition/refresh — USDA-only rematch for cargo detail.
 * Flag-gated: nutrition-engine. Never AI-estimates.
 */
export async function action({ request, context, params }: Route.ActionArgs) {
	if (request.method !== "POST") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

	const cargoId = params.id;
	if (!cargoId) {
		throw data({ error: "Missing cargo ID" }, { status: 400 });
	}

	try {
		const {
			groupId,
			session: { user },
		} = await requireActiveGroup(context, request);
		const env = context.cloudflare.env;
		const flagContext = buildWebFlagContext(request, env, { user });

		await assertFeatureEnabled(env, "nutrition-engine", flagContext);

		const rateLimitResult = await checkRateLimit(
			env.RATION_KV,
			"cargo_nutrition_refresh",
			user.id,
		);
		if (!rateLimitResult.allowed) {
			throw rateLimitResponse(
				rateLimitResult,
				"Too many nutrition refresh requests. Please try again later.",
			);
		}

		const result = await refreshCargoNutritionFromUsda(
			env,
			groupId,
			cargoId,
			flagContext,
			{ userId: user.id },
		);
		if (!result) {
			throw data({ error: "Not Found" }, { status: 404 });
		}

		return {
			matched: result.matched,
			nutrition: result.nutrition,
			message: result.message,
		};
	} catch (e) {
		return handleApiError(e);
	}
}
