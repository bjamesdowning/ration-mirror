import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { buildFlagContext } from "~/lib/feature-flags/flags.server";
import {
	mapPlanWeekSubmitError,
	submitPlanWeek,
} from "~/lib/plan-week-submit.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import { WeekPlanRequestSchema } from "~/lib/schemas/week-plan";
import type { Route } from "./+types/meal-plans.$id.plan-week";

/**
 * POST /api/meal-plans/:id/plan-week
 *
 * AI-powered weekly meal scheduler. Enqueues job; client polls status endpoint.
 */
export async function action({ request, context, params }: Route.ActionArgs) {
	if (request.method !== "POST") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

	const {
		session: { user },
		groupId,
	} = await requireActiveGroup(context, request);
	const env = context.cloudflare.env;

	const planId = params.id;
	if (!planId) {
		throw data({ error: "Plan ID required" }, { status: 400 });
	}

	const rateLimitResult = await checkRateLimit(
		env.RATION_KV,
		"plan_week",
		user.id,
	);
	if (!rateLimitResult.allowed) {
		throw rateLimitResponse(
			rateLimitResult,
			"Too many planning requests. Please try again later.",
		);
	}

	let requestBody: unknown;
	try {
		requestBody = await request.json();
	} catch {
		throw data({ error: "Invalid JSON body" }, { status: 400 });
	}

	const parseResult = WeekPlanRequestSchema.safeParse(requestBody);
	if (!parseResult.success) {
		throw data(
			{ error: parseResult.error.issues[0]?.message ?? "Invalid request" },
			{ status: 400 },
		);
	}

	try {
		return await submitPlanWeek(env, {
			userId: user.id,
			organizationId: groupId,
			planId,
			config: parseResult.data,
			flagContext: buildFlagContext(request, env, { user }),
		});
	} catch (error) {
		mapPlanWeekSubmitError(error);

		if (error instanceof Response) {
			throw error;
		}

		if (
			error &&
			typeof error === "object" &&
			"type" in error &&
			(error as { type: string }).type === "DataWithResponseInit"
		) {
			throw error as Response;
		}

		throw data({ error: "Internal planning error" }, { status: 500 });
	}
}
