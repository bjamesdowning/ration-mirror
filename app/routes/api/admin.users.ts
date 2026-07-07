import { drizzle } from "drizzle-orm/d1";
import * as schema from "~/db/schema";
import { listAdminUsers } from "~/lib/admin-users.server";
import { requireAdmin } from "~/lib/auth.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
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
		throw rateLimitResponse(
			rateLimitResult,
			"Too many search requests. Please try again later.",
			{ includeBodyMetadata: true },
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
