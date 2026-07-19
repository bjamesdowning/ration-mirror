import { data } from "react-router";
import type { FlagshipEvaluationContext } from "./context.server";
import { isFeatureEnabled } from "./flags.server";
import type { FlagKey } from "./registry";

export const FEATURE_DISABLED_CODE = "FEATURE_DISABLED" as const;

/**
 * Throws 403 + FEATURE_DISABLED when the flag is off.
 * Call before credit gates / queue / R2 writes so kills do not debit.
 */
export async function assertFeatureEnabled(
	env: Env,
	flag: FlagKey,
	context: FlagshipEvaluationContext,
	message = "This feature is temporarily unavailable.",
): Promise<void> {
	const enabled = await isFeatureEnabled(env, flag, context);
	if (enabled) return;
	throw data({ error: message, code: FEATURE_DISABLED_CODE }, { status: 403 });
}
