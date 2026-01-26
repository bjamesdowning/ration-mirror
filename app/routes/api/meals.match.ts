import type { LoaderFunctionArgs } from "react-router";
import { requireAuth } from "~/lib/auth.server";
import type { MealMatchQuery } from "~/lib/matching.server";
import { getMatchCacheKey, matchMeals } from "~/lib/matching.server";

const CACHE_TTL = 300; // 5 minutes in seconds

/**
 * GET /api/meals/match
 * Matches user's meals against their current inventory.
 * Supports strict and delta matching modes with KV caching.
 *
 * Query Parameters:
 * - mode: 'strict' | 'delta' (required)
 * - minMatch: number (0-100) for delta mode, default 50
 * - limit: number, default 20
 * - tag: string, optional meal tag filter
 */
export async function loader({ request, context }: LoaderFunctionArgs) {
	const { user } = await requireAuth(context, request);
	const url = new URL(request.url);

	// Parse query parameters
	const mode = url.searchParams.get("mode") as "strict" | "delta";
	const minMatch = Number.parseInt(
		url.searchParams.get("minMatch") || "50",
		10,
	);
	const limit = Number.parseInt(url.searchParams.get("limit") || "20", 10);
	const tag = url.searchParams.get("tag") || undefined;

	// Validate mode parameter
	if (mode !== "strict" && mode !== "delta") {
		return Response.json(
			{ error: "Invalid mode. Must be 'strict' or 'delta'" },
			{ status: 400 },
		);
	}

	// Validate minMatch range
	if (minMatch < 0 || minMatch > 100) {
		return Response.json(
			{ error: "minMatch must be between 0 and 100" },
			{ status: 400 },
		);
	}

	const query: MealMatchQuery = {
		mode,
		minMatch,
		limit,
		tag,
	};

	try {
		// Check KV cache first
		const cacheKey = getMatchCacheKey(user.id, query);
		const cached = await context.cloudflare.env.RATION_KV.get(cacheKey, "json");

		if (cached) {
			return Response.json({
				results: cached,
				cached: true,
			});
		}

		// Perform matching
		const results = await matchMeals(context.cloudflare.env.DB, user.id, query);

		// Store in KV cache with 5-minute TTL
		await context.cloudflare.env.RATION_KV.put(cacheKey, JSON.stringify(results), {
			expirationTtl: CACHE_TTL,
		});

		return Response.json({
			results,
			cached: false,
		});
	} catch (error) {
		console.error("Meal matching error:", error);
		return Response.json(
			{
				error: "Failed to match meals",
				details: error instanceof Error ? error.message : "Unknown error",
			},
			{ status: 500 },
		);
	}
}
