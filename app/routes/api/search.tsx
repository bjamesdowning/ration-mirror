// @ts-nocheck

import { inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { data } from "react-router";

import { inventory } from "~/db/schema";
import { requireAuth } from "~/lib/auth.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import { querySimilarItems } from "~/lib/vector.server";
import type { Route } from "./+types/search";

export async function loader({ request, context }: Route.LoaderArgs) {
	const { user } = await requireAuth(context, request);
	const userId = user.id;

	const url = new URL(request.url);
	const q = url.searchParams.get("q");

	if (!q || q.length < 2) {
		// Return empty if query is too short
		return { results: [] };
	}

	// 1. Rate Limiting (Distributed via KV)
	const rateLimitResult = await checkRateLimit(
		context.cloudflare.env.KV,
		"search",
		userId,
	);

	if (!rateLimitResult.allowed) {
		throw data(
			{
				error: "Too many search requests. Please try again later.",
				retryAfter: rateLimitResult.retryAfter,
				resetAt: rateLimitResult.resetAt,
			},
			{
				status: 429,
				headers: {
					"Retry-After": rateLimitResult.retryAfter?.toString() || "10",
					"X-RateLimit-Remaining": "0",
					"X-RateLimit-Reset": rateLimitResult.resetAt.toString(),
				},
			},
		);
	}

	// 2. Vector Search
	const matches = await querySimilarItems(context.cloudflare.env, userId, q, 5);

	if (matches.length === 0) {
		return { results: [] };
	}

	// 3. Hydrate from D1
	// Extract IDs. Vectorize match IDs correspond to Inventory Item IDs
	const ids = matches.map((m) => m.id);

	const db = drizzle(context.cloudflare.env.DB);
	const items = await db
		.select()
		.from(inventory)
		.where(inArray(inventory.id, ids));

	// 4. Merge/Order
	// D1 select implementation doesn't guarantee order matches the input array order usually.
	// We re-sort based on match score order for better relevance.
	const scoreMap = new Map(matches.map((m) => [m.id, m.score]));

	const sortedItems = items.sort((a, b) => {
		const scoreA = scoreMap.get(a.id) ?? 0;
		const scoreB = scoreMap.get(b.id) ?? 0;
		return scoreB - scoreA; // Descending score
	});

	return { results: sortedItems };
}
