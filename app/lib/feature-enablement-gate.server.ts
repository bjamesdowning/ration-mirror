import { requireAIConsent } from "~/lib/ai-consent.server";
import type { FlagshipEvaluationContext } from "~/lib/feature-flags/context.server";
import { isFeatureEnabled } from "~/lib/feature-flags/flags.server";

/**
 * Web AI parity gate — only when `feature-enablement-consent` is on.
 * Mobile keeps `requireMobileAIConsent` independently.
 */
export async function requireWebAIConsentIfEnabled(
	env: Env,
	userId: string,
	flagContext: FlagshipEvaluationContext,
): Promise<void> {
	const enabled = await isFeatureEnabled(
		env,
		"feature-enablement-consent",
		flagContext,
	);
	if (!enabled) return;
	await requireAIConsent(env.DB, userId);
}
