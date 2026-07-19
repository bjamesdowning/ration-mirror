import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { data } from "react-router";
import * as schema from "~/db/schema";
import { assertFeatureEnabled } from "~/lib/feature-flags/assert-enabled.server";
import type { FlagshipEvaluationContext } from "~/lib/feature-flags/flags.server";
import {
	AI_COSTS,
	InsufficientCreditsError,
	withCreditGate,
} from "~/lib/ledger.server";
import { getMealsForPicker } from "~/lib/manifest.server";
import { insertQueueJobPending } from "~/lib/queue-job.server";
import type { WeekPlanRequest } from "~/lib/schemas/week-plan";

export interface SubmitPlanWeekInput {
	userId: string;
	organizationId: string;
	planId: string;
	config: WeekPlanRequest;
	flagContext: FlagshipEvaluationContext;
}

export async function submitPlanWeek(
	env: Cloudflare.Env,
	input: SubmitPlanWeekInput,
) {
	const { userId, organizationId, planId, config, flagContext } = input;

	await assertFeatureEnabled(env, "ai-plan-week", flagContext);

	const db = drizzle(env.DB, { schema });

	const [planRow] = await db
		.select({ id: schema.mealPlan.id })
		.from(schema.mealPlan)
		.where(
			and(
				eq(schema.mealPlan.id, planId),
				eq(schema.mealPlan.organizationId, organizationId),
				eq(schema.mealPlan.isArchived, false),
			),
		)
		.limit(1);

	if (!planRow) {
		throw data({ error: "Meal plan not found" }, { status: 404 });
	}

	const allMeals = await getMealsForPicker(env.DB, organizationId);
	if (allMeals.length === 0) {
		throw data(
			{
				error:
					"No meals in your Galley. Add some recipes before planning your week.",
			},
			{ status: 400 },
		);
	}

	const PLAN_WEEK_QUEUE = env.PLAN_WEEK_QUEUE;
	if (!PLAN_WEEK_QUEUE) {
		throw data(
			{ error: "Meal planning service unavailable. Please try again later." },
			{ status: 503 },
		);
	}

	return withCreditGate(
		{
			env,
			organizationId,
			userId,
			cost: AI_COSTS.MEAL_PLAN_WEEKLY,
			reason: "Weekly Meal Plan",
		},
		async () => {
			const requestId = crypto.randomUUID();

			await insertQueueJobPending(
				env.DB,
				requestId,
				"plan_week",
				organizationId,
			);

			await PLAN_WEEK_QUEUE.send({
				requestId,
				planId,
				organizationId,
				userId,
				config,
				cost: AI_COSTS.MEAL_PLAN_WEEKLY,
			});

			return { status: "processing" as const, requestId };
		},
	);
}

export function mapPlanWeekSubmitError(outerError: unknown): void {
	if (outerError instanceof InsufficientCreditsError) {
		throw data(
			{
				error: "Insufficient credits",
				required: outerError.required,
				...(typeof outerError.current === "number"
					? { current: outerError.current }
					: {}),
			},
			{ status: 402 },
		);
	}
}
