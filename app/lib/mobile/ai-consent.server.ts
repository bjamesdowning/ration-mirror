import { throwMobileJsonError } from "~/lib/mobile/responses.server";
import { getMobileUser } from "./auth.server";

/**
 * Gates AI features on mobile. Returns when consent is recorded; throws 403 otherwise.
 */
export async function requireMobileAIConsent(
	env: Cloudflare.Env,
	userId: string,
): Promise<void> {
	const user = await getMobileUser(env, userId);
	const consentAt = user?.settings?.aiConsentAt;
	if (!consentAt || consentAt.trim().length === 0) {
		throwMobileJsonError(
			"AI processing consent required",
			403,
			"ai_consent_required",
		);
	}
}
