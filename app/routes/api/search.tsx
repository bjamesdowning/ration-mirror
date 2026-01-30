import { and, desc, eq, like, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { inventory } from "~/db/schema";
import { requireActiveGroup } from "~/lib/auth.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import { data } from "~/lib/response";
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
	const db = drizzle(context.cloudflare.env.DB);
	const searchPattern = `%${q.toLowerCase()}%`;

	const items = await db
		.select()
		.from(inventory)
		.where(
			and(
				eq(inventory.organizationId, groupId),
				or(
					like(inventory.name, searchPattern),
					// Note: JSON array tags are harder to search with simple LIKE,
					// so we prioritize name search for now.
				),
			),
		)
		.orderBy(desc(inventory.createdAt))
		.limit(20);

	return { results: items };
}
