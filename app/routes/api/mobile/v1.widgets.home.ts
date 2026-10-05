import { data } from "react-router";
import { handleApiError } from "~/lib/error-handler";
import { assertFeatureEnabled } from "~/lib/feature-flags/assert-enabled.server";
import { buildMobileFlagContext } from "~/lib/feature-flags/context.server";
import { loadHomeWidgetSnapshot } from "~/lib/home-widgets.server";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import { HomeWidgetQuerySchema } from "~/lib/schemas/home-widgets";
import type { Route } from "./+types/v1.widgets.home";

/**
 * GET /api/mobile/v1/widgets/home?date=YYYY-MM-DD
 * Flag-gated glance for the iOS Home Screen widgets.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
	if (request.method !== "GET") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

	try {
		const { userId, organizationId } = await requireMobileActiveGroup(
			context,
			request,
		);
		const env = context.cloudflare.env;
		const flagContext = buildMobileFlagContext(request, env, {
			user: { id: userId },
		});
		await assertFeatureEnabled(env, "ios-home-widgets", flagContext);

		const rateLimitResult = await checkRateLimit(
			env.RATION_KV,
			"widget_snapshot",
			userId,
		);
		if (!rateLimitResult.allowed) {
			throw rateLimitResponse(
				rateLimitResult,
				"Too many widget refreshes. Please try again later.",
			);
		}

		const url = new URL(request.url);
		const parsed = HomeWidgetQuerySchema.safeParse({
			date: url.searchParams.get("date"),
		});
		if (!parsed.success) {
			throw data(
				{ error: "Invalid query", details: parsed.error.flatten() },
				{ status: 400 },
			);
		}

		return loadHomeWidgetSnapshot(
			env.DB,
			env,
			flagContext,
			organizationId,
			userId,
			parsed.data.date,
		);
	} catch (e) {
		return handleApiError(e);
	}
}
