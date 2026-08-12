import { data } from "react-router";
import { attachTagsToCargo } from "~/lib/cargo.server";
import { handleApiError } from "~/lib/error-handler";
import { assertFeatureEnabled } from "~/lib/feature-flags/assert-enabled.server";
import { buildMobileFlagContext } from "~/lib/feature-flags/context.server";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { refreshCargoNutritionFromUsda } from "~/lib/nutrition/cargo-nutrition-refresh.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import type { Route } from "./+types/v1.cargo.$id.nutrition.refresh";

/**
 * POST /api/mobile/v1/cargo/:id/nutrition/refresh — USDA-only rematch for cargo detail.
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
		const { userId, organizationId } = await requireMobileActiveGroup(
			context,
			request,
		);
		const env = context.cloudflare.env;
		const flagContext = buildMobileFlagContext(request, env, {
			user: { id: userId },
		});

		await assertFeatureEnabled(env, "nutrition-engine", flagContext);

		const rateLimitResult = await checkRateLimit(
			env.RATION_KV,
			"cargo_nutrition_refresh",
			userId,
		);
		if (!rateLimitResult.allowed) {
			throw rateLimitResponse(
				rateLimitResult,
				"Too many nutrition refresh requests. Please try again later.",
			);
		}

		const result = await refreshCargoNutritionFromUsda(
			env,
			organizationId,
			cargoId,
			flagContext,
			{ userId },
		);
		if (!result?.item) {
			throw data({ error: "Not Found" }, { status: 404 });
		}

		const [item] = await attachTagsToCargo(env.DB, [result.item]);

		return {
			matched: result.matched,
			nutrition: result.nutrition,
			message: result.message,
			item,
		};
	} catch (e) {
		return handleApiError(e);
	}
}
