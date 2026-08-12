import type { FlagshipEvaluationContext } from "~/lib/feature-flags/context.server";
import { isFeatureEnabled } from "~/lib/feature-flags/flags.server";

export type NutritionCapabilities = {
	engine: boolean;
	manifest: boolean;
	cookLogSplit: boolean;
	goals: boolean;
	aiEstimate: boolean;
	asyncRecompute: boolean;
	/** Personal diary aggregates across kitchens (requires manifest or goals parent). */
	crossOrgDiary: boolean;
};

export type ResolveNutritionCapabilitiesOptions = {
	/** True only for server-verified scan/job workflows. */
	serverEligibleAi?: boolean;
	/** True when the nutrition recompute queue binding is configured. */
	queueConfigured?: boolean;
};

/**
 * Effective nutrition capability policy — parent flags gate children.
 * Defaults are false when Flagship is off or unevaluated.
 */
export async function resolveNutritionCapabilities(
	env: Parameters<typeof isFeatureEnabled>[0],
	flagContext: FlagshipEvaluationContext,
	options: ResolveNutritionCapabilitiesOptions = {},
): Promise<NutritionCapabilities> {
	const [
		engine,
		manifestFlag,
		cookLogFlag,
		goals,
		aiFlag,
		asyncFlag,
		crossOrgFlag,
	] = await Promise.all([
		isFeatureEnabled(env, "nutrition-engine", flagContext),
		isFeatureEnabled(env, "nutrition-manifest", flagContext),
		isFeatureEnabled(env, "nutrition-cook-log-split", flagContext),
		isFeatureEnabled(env, "nutrition-goals", flagContext),
		isFeatureEnabled(env, "nutrition-ai-estimate", flagContext),
		isFeatureEnabled(env, "nutrition-async-recompute", flagContext),
		isFeatureEnabled(env, "nutrition-cross-org-diary", flagContext),
	]);

	const manifest = engine && manifestFlag;
	const cookLogSplit = manifest && cookLogFlag;
	const aiEstimate = engine && aiFlag && (options.serverEligibleAi ?? false);
	const asyncRecompute =
		engine && asyncFlag && (options.queueConfigured ?? false);
	const crossOrgDiary = crossOrgFlag && (manifest || (engine && goals));

	return {
		engine,
		manifest,
		cookLogSplit,
		goals,
		aiEstimate,
		asyncRecompute,
		crossOrgDiary,
	};
}
