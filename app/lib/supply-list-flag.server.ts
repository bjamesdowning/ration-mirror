import { assertFeatureEnabled } from "./feature-flags/assert-enabled.server";
import type { FlagshipEvaluationContext } from "./feature-flags/context.server";
import { isFeatureEnabled } from "./feature-flags/flags.server";
import { SUPPLY_MULTI_LISTS_FLAG } from "./supply-list-kinds";

export async function isSupplyMultiListsEnabled(
	env: Env,
	context: FlagshipEvaluationContext,
): Promise<boolean> {
	return isFeatureEnabled(env, SUPPLY_MULTI_LISTS_FLAG, context);
}

export async function assertSupplyMultiListsEnabled(
	env: Env,
	context: FlagshipEvaluationContext,
): Promise<void> {
	await assertFeatureEnabled(
		env,
		SUPPLY_MULTI_LISTS_FLAG,
		context,
		"Supply list library is not available.",
	);
}
