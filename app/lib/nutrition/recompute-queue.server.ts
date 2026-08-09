/**
 * Compatibility shim — prefer scheduleMealNutritionRecompute / wake schema.
 */
import type { FlagshipEvaluationContext } from "~/lib/feature-flags/context.server";
import {
	type NutritionRecomputeJobMessage,
	NutritionRecomputeJobSchema,
	type NutritionRecomputeWakeMessage,
} from "~/lib/schemas/nutrition";
import { scheduleMealNutritionRecompute } from "./recompute-outbox.server";

export {
	buildNutritionRecomputeWake,
	mealNutritionJobKey,
	orgNutritionJobKey,
	scheduleMealNutritionRecompute,
	sendNutritionRecomputeWake,
} from "./recompute-outbox.server";

export type { NutritionRecomputeWakeMessage };

/**
 * @deprecated Legacy stub enqueue — maps mealId jobs onto the outbox/wake path.
 */
export async function submitNutritionRecomputeJob(
	env: Env,
	message: NutritionRecomputeJobMessage,
	flagContext: FlagshipEvaluationContext,
): Promise<{ enqueued: boolean; jobId: string }> {
	const parsed = NutritionRecomputeJobSchema.parse(message);
	if (!parsed.mealId) {
		return { enqueued: false, jobId: parsed.jobId };
	}
	const result = await scheduleMealNutritionRecompute(
		env,
		env.DB,
		parsed.mealId,
		parsed.organizationId,
		flagContext,
		{
			trigger: parsed.trigger === "cargo" ? "cargo_override" : "meal_write",
			origin: { surface: "system" },
		},
	);
	return {
		enqueued: result.mode === "async" || result.mode === "sync",
		jobId: parsed.jobId,
	};
}

/** @deprecated */
export function buildNutritionRecomputeMessage(input: {
	organizationId: string;
	trigger: NutritionRecomputeJobMessage["trigger"];
	mealId?: string;
	cargoId?: string;
}): NutritionRecomputeJobMessage {
	return {
		jobId: crypto.randomUUID(),
		organizationId: input.organizationId,
		trigger: input.trigger,
		mealId: input.mealId,
		cargoId: input.cargoId,
		enqueuedAt: new Date().toISOString(),
	};
}
