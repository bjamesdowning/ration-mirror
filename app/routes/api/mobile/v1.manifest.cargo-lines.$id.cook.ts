import { data } from "react-router";
import { handleApiError } from "~/lib/error-handler";
import { buildMobileFlagContext } from "~/lib/feature-flags/context.server";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { assertPlanFuelActions } from "~/lib/nutrition/fast-log-flag.server";
import { cookCargoLine } from "~/lib/plan-fuel-actions.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import type { Route } from "./+types/v1.manifest.cargo-lines.$id.cook";

/** POST /api/mobile/v1/manifest/cargo-lines/:id/cook — deduct the planned quantity once. */
export async function action({ request, context, params }: Route.ActionArgs) {
	if (request.method !== "POST") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}
	const lineId = params.id;
	if (!lineId) throw data({ error: "Missing line id" }, { status: 400 });
	try {
		const { userId, organizationId } = await requireMobileActiveGroup(
			context,
			request,
		);
		const flags = buildMobileFlagContext(request, context.cloudflare.env, {
			user: { id: userId },
		});
		await assertPlanFuelActions(context.cloudflare.env, flags);
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
		return await cookCargoLine(
			context.cloudflare.env.DB,
			organizationId,
			userId,
			lineId,
		);
	} catch (error) {
		return handleApiError(error);
	}
}
