import { handleApiError } from "~/lib/error-handler";
import type { MealMatchQuery } from "~/lib/matching.server";
import { matchMeals } from "~/lib/matching.server";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { MOBILE_PRE_LIMIT } from "~/lib/mobile/hub.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import { MealMatchQuerySchema } from "~/lib/schemas/meal";
import type { Route } from "./+types/v1.meals.match";

export async function loader({ request, context }: Route.LoaderArgs) {
	try {
		const { userId, organizationId } = await requireMobileActiveGroup(
			context,
			request,
		);

		const rateLimitResult = await checkRateLimit(
			context.cloudflare.env.RATION_KV,
			"meal_match",
			userId,
		);
		if (!rateLimitResult.allowed) {
			throw rateLimitResponse(
				rateLimitResult,
				"Too many meal match requests. Please wait and try again.",
			);
		}

		const url = new URL(request.url);
		const parsed = MealMatchQuerySchema.safeParse({
			mode: url.searchParams.get("mode") ?? undefined,
			minMatch: url.searchParams.get("minMatch") ?? undefined,
			limit: url.searchParams.get("limit") ?? undefined,
			tag: url.searchParams.get("tag") ?? undefined,
			servings: url.searchParams.get("servings") ?? undefined,
			type: url.searchParams.get("type") ?? undefined,
			domain: url.searchParams.get("domain") ?? undefined,
		});
		if (!parsed.success) {
			throw handleApiError(parsed.error);
		}

		const query: MealMatchQuery = {
			mode: parsed.data.mode,
			minMatch: parsed.data.minMatch,
			limit: parsed.data.limit,
			// Bounds the meal query before matching runs (see H-5) — must stay
			// >= the effective `limit`, or results would be truncated before
			// matching even starts.
			preLimit: Math.max(MOBILE_PRE_LIMIT, parsed.data.limit),
			tags: parsed.data.tag ? [parsed.data.tag] : undefined,
			servings: parsed.data.servings,
			...(parsed.data.type ? { type: parsed.data.type } : {}),
			...(parsed.data.domain ? { domain: parsed.data.domain } : {}),
		};

		const matches = await matchMeals(
			context.cloudflare.env,
			organizationId,
			query,
		);
		return { matches, total: matches.length };
	} catch (e) {
		return handleApiError(e);
	}
}
