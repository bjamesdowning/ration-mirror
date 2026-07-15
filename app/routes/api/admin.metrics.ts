import { drizzle } from "drizzle-orm/d1";
import * as schema from "~/db/schema";
import { loadHeavyAdminMetrics } from "~/lib/admin-loader.server";
import { requireAdmin } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import type { Route } from "./+types/admin.metrics";

export async function loader({ request, context }: Route.LoaderArgs) {
	try {
		const user = await requireAdmin(context, request);

		const rateLimitResult = await checkRateLimit(
			context.cloudflare.env.RATION_KV,
			"admin_metrics",
			user.id,
		);
		if (!rateLimitResult.allowed) {
			return rateLimitResponse(
				rateLimitResult,
				"Too many metrics requests. Please try again later.",
				{ includeBodyMetadata: true },
			);
		}

		const db = drizzle(context.cloudflare.env.DB, { schema });
		return await loadHeavyAdminMetrics(db, context.cloudflare.env.RATION_KV);
	} catch (error) {
		return handleApiError(error);
	}
}
