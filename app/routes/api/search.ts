import { and, desc, eq, like, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { data } from "react-router";
import { cargo } from "~/db/schema";
import { requireActiveGroup } from "~/lib/auth.server";
import { normalizeForCargoDedup } from "~/lib/matching.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import type { Route } from "./+types/search";

export async function loader({ request, context }: Route.LoaderArgs) {
	// 1. Auth & Group Context
	// Ideally search should be group-scoped.
	const {
		session: { user },
		groupId,
	} = await requireActiveGroup(context, request);

	const url = new URL(request.url);
	const q = url.searchParams.get("q");

	if (!q || q.length < 2) {
		return { results: [] };
	}

	// 2. Rate Limiting
	const rateLimitResult = await checkRateLimit(
		context.cloudflare.env.RATION_KV,
		"search",
		user.id,
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

	// 3. Database Search
	// Normalize the query to expand synonyms (e.g. "tinned" → "canned") so a
	// user searching a regional variant still finds canonically-stored items.
	// We OR both patterns so we also match items stored under the variant form.
	const db = drizzle(context.cloudflare.env.DB);
	const rawPattern = `%${q.toLowerCase()}%`;
	const normalizedTerm = normalizeForCargoDedup(q);
	const normalizedPattern =
		normalizedTerm !== q.toLowerCase() ? `%${normalizedTerm}%` : null;

	const nameConditions = normalizedPattern
		? or(like(cargo.name, rawPattern), like(cargo.name, normalizedPattern))
		: like(cargo.name, rawPattern);

	const items = await db
		.select()
		.from(cargo)
		.where(and(eq(cargo.organizationId, groupId), nameConditions))
		.orderBy(desc(cargo.createdAt))
		.limit(20);

	return { results: items };
}
