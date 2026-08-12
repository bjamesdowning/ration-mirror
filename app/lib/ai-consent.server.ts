import { data } from "react-router";
import { getUserSettings } from "~/lib/auth.server";
import type { UserSettings } from "~/lib/types";

/**
 * Shared AI Features consent gate (web + mobile).
 * Source of truth: `user.settings.aiConsentAt`.
 */
export function hasAIConsent(
	settings: UserSettings | null | undefined,
): boolean {
	const consentAt = settings?.aiConsentAt;
	return typeof consentAt === "string" && consentAt.trim().length > 0;
}

export class AIConsentRequiredError extends Error {
	readonly code = "ai_consent_required" as const;
	readonly status = 403 as const;

	constructor(
		message = "AI Features are off. Enable them in Settings to continue.",
	) {
		super(message);
		this.name = "AIConsentRequiredError";
	}
}

export function assertAIConsent(
	settings: UserSettings | null | undefined,
): void {
	if (!hasAIConsent(settings)) {
		throw new AIConsentRequiredError();
	}
}

/** Load settings and assert AI consent (web + shared callers). */
export async function requireAIConsent(
	db: D1Database,
	userId: string,
): Promise<void> {
	const settings = await getUserSettings(db, userId);
	if (!hasAIConsent(settings)) {
		throwAIConsentRequired();
	}
}

/** React Router `data()` throw for web routes that prefer Response-shaped errors. */
export function throwAIConsentRequired(): never {
	throw data(
		{
			error: "AI Features are off. Enable them in Settings to continue.",
			code: "ai_consent_required",
		},
		{ status: 403 },
	);
}
