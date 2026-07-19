import { data } from "react-router";
import { handleApiError } from "~/lib/error-handler";
import { buildFlagContext } from "~/lib/feature-flags/flags.server";
import { ensureMealPlan } from "~/lib/manifest.server";
import { requireMobileAIConsent } from "~/lib/mobile/ai-consent.server";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import {
	mapPlanWeekSubmitError,
	submitPlanWeek,
} from "~/lib/plan-week-submit.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import { MobileWeekPlanRequestSchema } from "~/lib/schemas/mobile/manifest";
import type { Route } from "./+types/v1.manifest.plan-week";

export async function action({ request, context }: Route.ActionArgs) {
	if (request.method !== "POST") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

	try {
		const { userId, organizationId } = await requireMobileActiveGroup(
			context,
			request,
		);
		const env = context.cloudflare.env;

		await requireMobileAIConsent(env, userId);

		const rateLimitResult = await checkRateLimit(
			env.RATION_KV,
			"plan_week",
			userId,
		);
		if (!rateLimitResult.allowed) {
			throw rateLimitResponse(
				rateLimitResult,
				"Too many planning requests. Please try again later.",
			);
		}

		const body = await request.json();
		const config = MobileWeekPlanRequestSchema.parse(body);
		const plan = await ensureMealPlan(env.DB, organizationId);

		return await submitPlanWeek(env, {
			userId,
			organizationId,
			planId: plan.id,
			config,
			flagContext: buildFlagContext(request, env, { user: { id: userId } }),
		});
	} catch (e) {
		mapPlanWeekSubmitError(e);
		return handleApiError(e);
	}
}
