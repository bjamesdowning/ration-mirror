import { data } from "react-router";
import {
	assertFeatureEnabled,
	FEATURE_DISABLED_CODE,
} from "~/lib/feature-flags/assert-enabled.server";
import type { FlagshipEvaluationContext } from "~/lib/feature-flags/context.server";
import { isFeatureEnabled } from "~/lib/feature-flags/flags.server";
import {
	NUTRITION_FAST_LOG_IOS_MIN,
	nutritionFastLogClientAllowed,
} from "./fuel-capture";

export { NUTRITION_FAST_LOG_IOS_MIN, nutritionFastLogClientAllowed };

export async function isNutritionFastLogEnabled(
	env: Env,
	context: FlagshipEvaluationContext,
): Promise<boolean> {
	if (!nutritionFastLogClientAllowed(context)) return false;
	return isFeatureEnabled(env, "nutrition-fast-log", context);
}

export async function assertNutritionFastLog(
	env: Env,
	context: FlagshipEvaluationContext,
): Promise<void> {
	if (!nutritionFastLogClientAllowed(context)) {
		throw data(
			{
				error: "Personal food log requires iOS 1.6 or later.",
				code: FEATURE_DISABLED_CODE,
			},
			{ status: 403 },
		);
	}
	await assertFeatureEnabled(
		env,
		"nutrition-fast-log",
		context,
		"Personal food log is unavailable.",
	);
}
