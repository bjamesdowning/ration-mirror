import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { log, redactId } from "~/lib/logging.server";
import type { MealMatchQuery } from "~/lib/matching.server";
import { matchMeals } from "~/lib/matching.server";
import type { Route } from "./+types/meals.match";

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
export async function loader({ request, context }: Route.LoaderArgs) {
	const { groupId } = await requireActiveGroup(context, request);
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
		throw data(
			{ error: "Invalid mode. Must be 'strict' or 'delta'" },
			{ status: 400 },
		);
	}

	// Validate minMatch range
	if (minMatch < 0 || minMatch > 100) {
		throw data(
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
		log.info("[Match API] Starting match request", {
			groupId: redactId(groupId),
			mode,
			minMatch,
			limit,
			tag,
		});

		// Perform matching
		const results = await matchMeals(context.cloudflare.env.DB, groupId, query);

		log.info("[Match API] Match complete", { resultsCount: results.length });

		return { results };
	} catch (error) {
		log.error("[Match API] Match failed", error, {
			detail: error instanceof Error ? error.message : "Unknown error",
		});

		throw data({ error: "Failed to match meals" }, { status: 500 });
	}
}
