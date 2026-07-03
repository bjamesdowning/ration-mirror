import { drizzle } from "drizzle-orm/d1";
import { data } from "react-router";
import * as schema from "~/db/schema";
import { listAdminUsers } from "~/lib/admin-users.server";
import { requireAdmin } from "~/lib/auth.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import { AdminUsersListSchema } from "~/lib/schemas/admin";
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
	const params = AdminUsersListSchema.parse({
		q: url.searchParams.get("q") ?? undefined,
		page: url.searchParams.get("page") ?? undefined,
		limit: url.searchParams.get("limit") ?? undefined,
		sort: url.searchParams.get("sort") ?? undefined,
		order: url.searchParams.get("order") ?? undefined,
	});

	const db = drizzle(context.cloudflare.env.DB, { schema });
	return listAdminUsers(db, params);
}
