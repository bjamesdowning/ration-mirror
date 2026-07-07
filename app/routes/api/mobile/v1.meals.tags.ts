import { handleApiError } from "~/lib/error-handler";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import { getOrganizationTagSlugs } from "~/lib/tags.server";
import type { Route } from "./+types/v1.meals.tags";

export async function loader({ request, context }: Route.LoaderArgs) {
	try {
		const { userId, organizationId } = await requireMobileActiveGroup(
			context,
			request,
		);

		const rateLimitResult = await checkRateLimit(
			context.cloudflare.env.RATION_KV,
			"meal_list",
			userId,
		);
		if (!rateLimitResult.allowed) {
			throw rateLimitResponse(
				rateLimitResult,
				"Too many requests. Please try again later.",
			);
		}

		const tags = await getOrganizationTagSlugs(
			context.cloudflare.env.DB,
			organizationId,
		);
		return { tags };
	} catch (e) {
		return handleApiError(e);
	}
}
