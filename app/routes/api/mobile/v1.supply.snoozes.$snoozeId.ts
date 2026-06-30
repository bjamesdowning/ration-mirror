import { data } from "react-router";
import { handleApiError } from "~/lib/error-handler";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import { unsnoozeSupplyItem } from "~/lib/supply.server";
import type { Route } from "./+types/v1.supply.snoozes.$snoozeId";

/** DELETE /api/mobile/v1/supply/snoozes/:snoozeId — early expire a snooze. */
export async function action({ request, context, params }: Route.ActionArgs) {
	const snoozeId = params.snoozeId;
	if (!snoozeId) {
		throw data({ error: "Snooze id required" }, { status: 400 });
	}

	if (request.method !== "DELETE") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

	try {
		const { userId, organizationId } = await requireMobileActiveGroup(
			context,
			request,
		);

		const rateLimitResult = await checkRateLimit(
			context.cloudflare.env.RATION_KV,
			"grocery_mutation",
			userId,
		);
		if (!rateLimitResult.allowed) {
			throw data(
				{ error: "Too many requests. Please try again later." },
				{ status: 429, headers: { "Retry-After": "60" } },
			);
		}

		const result = await unsnoozeSupplyItem(
			context.cloudflare.env.DB,
			organizationId,
			snoozeId,
		);
		return result;
	} catch (e) {
		return handleApiError(e);
	}
}
