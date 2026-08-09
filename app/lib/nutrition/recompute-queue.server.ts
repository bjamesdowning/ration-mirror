import type { FlagshipEvaluationContext } from "~/lib/feature-flags/context.server";
import { isFeatureEnabled } from "~/lib/feature-flags/flags.server";
import {
	type NutritionRecomputeJobMessage,
	NutritionRecomputeJobSchema,
} from "~/lib/schemas/nutrition";
import { emitNutritionRecomputeEnqueued } from "~/lib/telemetry.server";

/**
 * Submit async nutrition recompute job (Slice 8 stub).
 * No-op unless `nutrition-async-recompute` is enabled — no queue table yet.
 */
export async function submitNutritionRecomputeJob(
	env: Env,
	message: NutritionRecomputeJobMessage,
	flagContext: FlagshipEvaluationContext,
): Promise<{ enqueued: boolean; jobId: string }> {
	const parsed = NutritionRecomputeJobSchema.parse(message);
	const enabled = await isFeatureEnabled(
		env,
		"nutrition-async-recompute",
		flagContext,
	);
	if (!enabled) {
		return { enqueued: false, jobId: parsed.jobId };
	}

	// Queue producer stub — wire to Cloudflare Queue when Slice 3 lands.
	emitNutritionRecomputeEnqueued(parsed.trigger);
	return { enqueued: true, jobId: parsed.jobId };
}

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
