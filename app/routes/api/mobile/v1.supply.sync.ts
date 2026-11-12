import { data } from "react-router";
import { getUserSettings } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { buildMobileFlagContext } from "~/lib/feature-flags/context.server";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { isPlanFuelActionsEnabled } from "~/lib/nutrition/fast-log-flag.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
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
			throw rateLimitResponse(
				rateLimitResult,
				"Too many requests. Please try again later.",
			);
		}

		const settings = await getUserSettings(context.cloudflare.env.DB, userId);
		const unitDisplayMode = resolveUnitDisplayMode(settings);

		const flags = buildMobileFlagContext(request, context.cloudflare.env, {
			user: { id: userId },
		});
		const includeCargoPlanLines = await isPlanFuelActionsEnabled(
			context.cloudflare.env,
			flags,
		);
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
			userId,
			includeCargoPlanLines,
		);

		return { list: result.list, summary: result.summary };
	} catch (e) {
		return handleApiError(e);
	}
}
