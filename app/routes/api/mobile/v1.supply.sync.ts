import { data } from "react-router";
import { getUserSettings } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import { createSupplyListFromSelectedMeals } from "~/lib/supply.server";
import { resolveUnitDisplayMode } from "~/lib/unit-display-mode";
import type { Route } from "./+types/v1.supply.sync";

export async function action({ request, context }: Route.ActionArgs) {
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
			"grocery_mutation",
			userId,
		);
		if (!rateLimitResult.allowed) {
			throw data(
				{ error: "Too many requests. Please try again later." },
				{ status: 429, headers: { "Retry-After": "60" } },
			);
		}

		const settings = await getUserSettings(context.cloudflare.env.DB, userId);
		const unitDisplayMode = resolveUnitDisplayMode(settings);

		const result = await createSupplyListFromSelectedMeals(
			context.cloudflare.env,
			organizationId,
			undefined,
			{
				requestId: request.headers.get("cf-ray") ?? undefined,
				trigger: "mobile_supply_sync",
				organizationId,
			},
			unitDisplayMode,
		);

		return { list: result.list, summary: result.summary };
	} catch (e) {
		return handleApiError(e);
	}
}
