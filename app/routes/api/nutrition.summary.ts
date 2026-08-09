import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { FEATURE_DISABLED_CODE } from "~/lib/feature-flags/assert-enabled.server";
import {
	buildFlagContext,
	isFeatureEnabled,
} from "~/lib/feature-flags/flags.server";
import { getNutritionSummary } from "~/lib/nutrition/persist.server";
import { NutritionSummaryQuerySchema } from "~/lib/schemas/nutrition";
import type { Route } from "./+types/nutrition.summary";

/**
 * GET /api/nutrition/summary?from=&to= — daily intake totals for the active org.
 * Gated by nutrition-goals or nutrition-manifest.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
	try {
		const {
			groupId,
			session: { user },
		} = await requireActiveGroup(context, request);
		const env = context.cloudflare.env;
		const flagContext = buildFlagContext(request, env, { user });

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

		const summary = await getNutritionSummary(
			env.DB,
			user.id,
			groupId,
			parsed.data.from,
			parsed.data.to,
		);
		return summary;
	} catch (e) {
		return handleApiError(e);
	}
}
