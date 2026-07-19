import { data } from "react-router";
import { assertFeatureEnabled } from "~/lib/feature-flags/assert-enabled.server";
import type { FlagshipEvaluationContext } from "~/lib/feature-flags/flags.server";
import {
	AI_COSTS,
	InsufficientCreditsError,
	withCreditGate,
} from "~/lib/ledger.server";
import { insertQueueJobPending } from "~/lib/queue-job.server";

export interface SubmitMealGenerateInput {
	userId: string;
	organizationId: string;
	customization?: string;
	flagContext: FlagshipEvaluationContext;
}

export async function submitMealGenerate(
	env: Cloudflare.Env,
	input: SubmitMealGenerateInput,
) {
	const { userId, organizationId, customization, flagContext } = input;

	await assertFeatureEnabled(env, "ai-generate-meal", flagContext);

	return withCreditGate(
		{
			env,
			organizationId,
			userId,
			cost: AI_COSTS.MEAL_GENERATE,
			reason: "Meal Generation",
		},
		async () => {
			const MEAL_GENERATE_QUEUE = env.MEAL_GENERATE_QUEUE;
			if (!MEAL_GENERATE_QUEUE) {
				throw data(
					{
						error:
							"Meal generation service unavailable. Please try again later.",
					},
					{ status: 503 },
				);
			}

			const requestId = crypto.randomUUID();

			await insertQueueJobPending(
				env.DB,
				requestId,
				"meal_generate",
				organizationId,
			);

			await MEAL_GENERATE_QUEUE.send({
				requestId,
				organizationId,
				userId,
				customization,
				cost: AI_COSTS.MEAL_GENERATE,
			});

			return { status: "queued" as const, requestId };
		},
	);
}

export function mapMealGenerateSubmitError(outerError: unknown): void {
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
