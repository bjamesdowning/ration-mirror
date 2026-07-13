import { drizzle } from "drizzle-orm/d1";
import * as schema from "~/db/schema";
import { listAdminUsers } from "~/lib/admin-users.server";
import { requireAdmin } from "~/lib/auth.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import { AdminUsersListSchema } from "~/lib/schemas/admin";
import type { Route } from "./+types/admin.users";

export async function loader({ request, context }: Route.LoaderArgs) {
	const user = await requireAdmin(context, request);

	const url = new URL(request.url);
	const params = AdminUsersListSchema.parse({
		q: url.searchParams.get("q") ?? undefined,
		page: url.searchParams.get("page") ?? undefined,
		limit: url.searchParams.get("limit") ?? undefined,
		sort: url.searchParams.get("sort") ?? undefined,
		order: url.searchParams.get("order") ?? undefined,
	});

	const isSearch = Boolean(params.q?.trim());
	const rateLimitResult = await checkRateLimit(
		context.cloudflare.env.RATION_KV,
		isSearch ? "admin_search" : "admin_list",
		user.id,
	);
	if (!rateLimitResult.allowed) {
		// Return (not throw) so fetchers receive the data instead of hitting ErrorBoundary
		return rateLimitResponse(
			rateLimitResult,
			isSearch
				? "Too many search requests. Please try again later."
				: "Too many list requests. Please try again later.",
			{ includeBodyMetadata: true },
		);
	}

	const db = drizzle(context.cloudflare.env.DB, { schema });
	return listAdminUsers(db, params);
}
