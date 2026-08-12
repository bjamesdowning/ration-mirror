import { assertAIConsent, hasAIConsent } from "~/lib/ai-consent.server";
import { throwMobileJsonError } from "~/lib/mobile/responses.server";
import { getMobileUser } from "./auth.server";

/**
 * Gates AI features on mobile. Returns when consent is recorded; throws 403 otherwise.
 * Uses the shared `aiConsentAt` check (same as web).
 */
export async function requireMobileAIConsent(
	env: Cloudflare.Env,
	userId: string,
): Promise<void> {
	const user = await getMobileUser(env, userId);
	try {
		assertAIConsent(user?.settings);
	} catch {
		throwMobileJsonError(
			"AI Features are off. Enable them in Settings to continue.",
			403,
			"ai_consent_required",
		);
	}
}

export { hasAIConsent };
