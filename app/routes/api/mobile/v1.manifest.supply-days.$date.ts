import { data } from "react-router";
import { handleApiError } from "~/lib/error-handler";
import { toggleManifestDaySupply } from "~/lib/manifest-supply.server";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import type { Route } from "./+types/v1.manifest.supply-days.$date";

/** POST /api/mobile/v1/manifest/supply-days/:date — toggle Supply sync for a day. */
export async function action({ request, context, params }: Route.ActionArgs) {
	if (request.method !== "POST") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

	try {
		const { userId, organizationId } = await requireMobileActiveGroup(
			context,
			request,
		);

		const rateLimitResult = await checkRateLimit(
			context.cloudflare.env.RATION_KV,
			"meal_mutation",
			userId,
		);
		if (!rateLimitResult.allowed) {
			throw rateLimitResponse(
				rateLimitResult,
				"Too many requests. Please try again later.",
			);
		}

		const date = params.date;
		if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
			throw data({ error: "Invalid date" }, { status: 400 });
		}

		return await toggleManifestDaySupply(
			context.cloudflare.env.DB,
			organizationId,
			date,
		);
	} catch (e) {
		return handleApiError(e);
	}
}
