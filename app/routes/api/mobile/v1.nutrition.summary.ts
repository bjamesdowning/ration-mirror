import { data } from "react-router";
import { handleApiError } from "~/lib/error-handler";
import { FEATURE_DISABLED_CODE } from "~/lib/feature-flags/assert-enabled.server";
import {
	buildFlagContext,
	isFeatureEnabled,
} from "~/lib/feature-flags/flags.server";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { getNutritionSummary } from "~/lib/nutrition/persist.server";
import { NutritionSummaryQuerySchema } from "~/lib/schemas/nutrition";
import type { Route } from "./+types/v1.nutrition.summary";

/**
 * GET /api/mobile/v1/nutrition/summary?from=&to=
 */
export async function loader({ request, context }: Route.LoaderArgs) {
	try {
		const { userId, organizationId } = await requireMobileActiveGroup(
			context,
			request,
		);
		const env = context.cloudflare.env;
		const flagContext = buildFlagContext(request, env, {
			user: { id: userId },
		});

		const [goalsOn, manifestOn] = await Promise.all([
			isFeatureEnabled(env, "nutrition-goals", flagContext),
			isFeatureEnabled(env, "nutrition-manifest", flagContext),
		]);
		if (!goalsOn && !manifestOn) {
			throw data(
				{
					error: "This feature is temporarily unavailable.",
					code: FEATURE_DISABLED_CODE,
				},
				{ status: 403 },
			);
		}

		const url = new URL(request.url);
		const parsed = NutritionSummaryQuerySchema.safeParse({
			from: url.searchParams.get("from"),
			to: url.searchParams.get("to"),
		});
		if (!parsed.success) {
			throw data(
				{ error: "Invalid query", details: parsed.error.flatten() },
				{ status: 400 },
			);
		}

		return getNutritionSummary(
			env.DB,
			userId,
			organizationId,
			parsed.data.from,
			parsed.data.to,
		);
	} catch (e) {
		return handleApiError(e);
	}
}
