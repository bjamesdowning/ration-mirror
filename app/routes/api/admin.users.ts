import { like, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { data } from "react-router";
import * as schema from "~/db/schema";
import { requireAdmin } from "~/lib/auth.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import type { Route } from "./+types/admin.users";

export async function loader({ request, context }: Route.LoaderArgs) {
	const user = await requireAdmin(context, request);

	const rateLimitResult = await checkRateLimit(
		context.cloudflare.env.RATION_KV,
		"admin_search",
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
					"Retry-After": rateLimitResult.retryAfter?.toString() || "60",
					"X-RateLimit-Remaining": "0",
					"X-RateLimit-Reset": rateLimitResult.resetAt.toString(),
				},
			},
		);
	}

	const url = new URL(request.url);
	const q = url.searchParams.get("q");

	if (!q || q.trim().length < 2) {
		return { users: [] };
	}

	const db = drizzle(context.cloudflare.env.DB, { schema });
	const searchPattern = `%${q.trim()}%`;

	const users = await db
		.select({
			id: schema.user.id,
			name: schema.user.name,
			email: schema.user.email,
			isAdmin: schema.user.isAdmin,
			createdAt: schema.user.createdAt,
		})
		.from(schema.user)
		.where(
			or(
				like(schema.user.name, searchPattern),
				like(schema.user.email, searchPattern),
			),
		)
		.limit(10);

	return { users };
}
