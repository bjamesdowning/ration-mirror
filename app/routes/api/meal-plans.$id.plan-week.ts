import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { data } from "react-router";
import * as schema from "~/db/schema";
import { requireActiveGroup } from "~/lib/auth.server";
import {
	AI_COSTS,
	InsufficientCreditsError,
	withCreditGate,
} from "~/lib/ledger.server";
import { getMealsForPicker } from "~/lib/manifest.server";
import { insertQueueJobPending } from "~/lib/queue-job.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import { WeekPlanRequestSchema } from "~/lib/schemas/week-plan";
import type { Route } from "./+types/meal-plans.$id.plan-week";

/**
 * POST /api/meal-plans/:id/plan-week
 *
 * AI-powered weekly meal scheduler. Enqueues job; client polls status endpoint.
 * Producer: validates input, enqueues, returns requestId.
 *
 * Security:
 *   - requireActiveGroup enforces auth + RLS
 *   - plan_week rate limit: 5 req/min per user
 *   - 3-credit gate via withCreditGate (auto-refunds on error)
 */
export async function action({ request, context, params }: Route.ActionArgs) {
	if (request.method !== "POST") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

	const {
		session: { user },
		groupId,
	} = await requireActiveGroup(context, request);

	const planId = params.id;
	if (!planId) {
		throw data({ error: "Plan ID required" }, { status: 400 });
	}

	const rateLimitResult = await checkRateLimit(
		context.cloudflare.env.RATION_KV,
		"plan_week",
		user.id,
	);
	if (!rateLimitResult.allowed) {
		throw data(
			{ error: "Too many planning requests. Please try again later." },
			{
				status: 429,
				headers: { "Retry-After": String(rateLimitResult.retryAfter ?? 60) },
			},
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
	const config = parseResult.data;

	const db = drizzle(context.cloudflare.env.DB, { schema });

	const [planRow] = await db
		.select({ id: schema.mealPlan.id })
		.from(schema.mealPlan)
		.where(
			and(
				eq(schema.mealPlan.id, planId),
				eq(schema.mealPlan.organizationId, groupId),
				eq(schema.mealPlan.isArchived, false),
			),
		)
		.limit(1);

	if (!planRow) {
		throw data({ error: "Meal plan not found" }, { status: 404 });
	}

	const allMeals = await getMealsForPicker(context.cloudflare.env.DB, groupId);
	if (allMeals.length === 0) {
		throw data(
			{
				error:
					"No meals in your Galley. Add some recipes before planning your week.",
			},
			{ status: 400 },
		);
	}

	const PLAN_WEEK_QUEUE = context.cloudflare.env.PLAN_WEEK_QUEUE;
	if (!PLAN_WEEK_QUEUE) {
		throw data(
			{ error: "Meal planning service unavailable. Please try again later." },
			{ status: 503 },
		);
	}

	try {
		return await withCreditGate(
			{
				env: context.cloudflare.env,
				organizationId: groupId,
				userId: user.id,
				cost: AI_COSTS.MEAL_PLAN_WEEKLY,
				reason: "Weekly Meal Plan",
			},
			async () => {
				const requestId = crypto.randomUUID();

				await PLAN_WEEK_QUEUE.send({
					requestId,
					planId,
					organizationId: groupId,
					userId: user.id,
					config,
					cost: AI_COSTS.MEAL_PLAN_WEEKLY,
				});

				await insertQueueJobPending(
					context.cloudflare.env.DB,
					requestId,
					"plan_week",
					groupId,
				);

				return { status: "processing" as const, requestId };
			},
		);
	} catch (error) {
		if (error instanceof InsufficientCreditsError) {
			throw data(
				{
					error: "Insufficient credits",
					required: error.required,
					...(typeof error.current === "number"
						? { current: error.current }
						: {}),
				},
				{ status: 402 },
			);
		}

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
