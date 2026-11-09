import { data } from "react-router";
import { isVersionAtLeast } from "~/lib/client-version";
import {
	assertFeatureEnabled,
	FEATURE_DISABLED_CODE,
} from "~/lib/feature-flags/assert-enabled.server";
import type { FlagshipEvaluationContext } from "~/lib/feature-flags/context.server";
import { isFeatureEnabled } from "~/lib/feature-flags/flags.server";

/**
 * Personal log ships behind the flag and, on iOS, a 1.6 client.
 * Do not raise IOS_FEATURE_FLOOR and do not mark the flag iosAlwaysOn.
 * A missing or older iOS version fails closed even when Flagship is on.
 */
export const NUTRITION_FAST_LOG_IOS_MIN = "1.6.0";

export function nutritionFastLogClientAllowed(
	context: FlagshipEvaluationContext,
): boolean {
	if (context.clientPlatform !== "ios") return true;
	const version = context.clientVersion;
	if (typeof version !== "string") return false;
	return isVersionAtLeast(version, NUTRITION_FAST_LOG_IOS_MIN);
}

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
