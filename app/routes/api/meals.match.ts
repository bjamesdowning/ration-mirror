import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { log, redactId } from "~/lib/logging.server";
import type { MealMatchQuery } from "~/lib/matching.server";
import { matchMeals } from "~/lib/matching.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import { MealMatchQuerySchema } from "~/lib/schemas/meal";
import type { Route } from "./+types/meals.match";

/**
 * GET /api/meals/match
 * Matches user's meals against their current inventory.
 * Supports strict and delta matching modes with KV caching.
 *
 * Query Parameters:
 * - mode: 'strict' | 'delta' (required)
 * - minMatch: number (0-100) for delta mode, default 50
 * - limit: number (1-100), default 20
 * - tag: string, optional meal tag filter
 * - servings: number, optional desired servings (scales required quantities)
 * - type: 'recipe' | 'provision', optional meal type filter
 * - domain: string, optional domain filter (e.g. 'food')
 */
export async function loader({ request, context }: Route.LoaderArgs) {
	const {
		groupId,
		session: { user },
	} = await requireActiveGroup(context, request);

	const rateLimitResult = await checkRateLimit(
		context.cloudflare.env.RATION_KV,
		"meal_match",
		user.id,
	);
	if (!rateLimitResult.allowed) {
		throw data(
			{
				error:
					"Too many meal match requests. Please wait a moment and try again.",
			},
			{
				status: 429,
				headers: {
					"Retry-After": rateLimitResult.retryAfter?.toString() || "60",
					"X-RateLimit-Remaining": "0",
					"X-RateLimit-Reset": rateLimitResult.resetAt.toString(),
				},
			},
		);
	}

	const url = new URL(request.url);
	const raw = {
		mode: url.searchParams.get("mode") ?? undefined,
		minMatch: url.searchParams.get("minMatch") ?? undefined,
		limit: url.searchParams.get("limit") ?? undefined,
		tag: url.searchParams.get("tag") ?? undefined,
		servings: url.searchParams.get("servings") ?? undefined,
		type: url.searchParams.get("type") ?? undefined,
		domain: url.searchParams.get("domain") ?? undefined,
	};

	const parsed = MealMatchQuerySchema.safeParse(raw);
	if (!parsed.success) {
		throw handleApiError(parsed.error);
	}

	// Map single `tag` query param to the `tags` array field used by matchMeals
	const query: MealMatchQuery = {
		mode: parsed.data.mode,
		minMatch: parsed.data.minMatch,
		limit: parsed.data.limit,
		tags: parsed.data.tag ? [parsed.data.tag] : undefined,
		servings: parsed.data.servings,
		...(parsed.data.type ? { type: parsed.data.type } : {}),
		...(parsed.data.domain ? { domain: parsed.data.domain } : {}),
	};

	try {
		log.info("[Match API] Starting match request", {
			groupId: redactId(groupId),
			mode: query.mode,
			minMatch: query.minMatch,
			limit: query.limit,
			tags: query.tags,
			servings: query.servings,
			type: query.type,
			domain: query.domain,
		});

		const results = await matchMeals(context.cloudflare.env, groupId, query);

		log.info("[Match API] Match complete", { resultsCount: results.length });

		return { results };
	} catch (error) {
		throw handleApiError(error);
	}
}
