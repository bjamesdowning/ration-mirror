// @ts-nocheck

import { inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import { inventory } from "~/db/schema";
import { requireAuth } from "~/lib/auth.server";
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

	// 1. Vector Search
	const matches = await querySimilarItems(context.cloudflare.env, userId, q, 5);

	if (matches.length === 0) {
		return { results: [] };
	}

	// 2. Hydrate from D1
	// Extract IDs. Vectorize match IDs correspond to Inventory Item IDs
	const ids = matches.map((m) => m.id);

	const db = drizzle(context.cloudflare.env.DB);
	const items = await db
		.select()
		.from(inventory)
		.where(inArray(inventory.id, ids));

	// 3. Merge/Order
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
