import { sha256Hex } from "../crypto.server";
import {
	buildFlagContext,
	isFeatureEnabled,
} from "../feature-flags/flags.server";
import type { UserSettings } from "../types";
import {
	ONBOARDING_BRIEFING_ACCOUNT_MAX_AGE_MS,
	ONBOARDING_BRIEFING_BOOTSTRAP_PROMPT,
	ONBOARDING_BRIEFING_PENDING_TTL_SEC,
} from "./constants";

const ONBOARDING_BRIEFING_KV_PREFIX = "copilot:onboarding-briefing";

export type OnboardingBriefingKvState = "pending" | "consumed";

export function onboardingBriefingKey(userId: string): string {
	return `${ONBOARDING_BRIEFING_KV_PREFIX}:${userId}`;
}

export function isIosCopilotClient(request: Request | undefined): boolean {
	const client = request?.headers.get("X-Ration-Client") ?? "";
	return client.startsWith("ios/");
}

export function normalizeOnboardingBriefingPrompt(text: string): string {
	return text.trim();
}

let bootstrapPromptHashPromise: Promise<string> | null = null;

export function getOnboardingBriefingPromptHash(): Promise<string> {
	if (!bootstrapPromptHashPromise) {
		bootstrapPromptHashPromise = sha256Hex(
			normalizeOnboardingBriefingPrompt(ONBOARDING_BRIEFING_BOOTSTRAP_PROMPT),
			0,
		);
	}
	return bootstrapPromptHashPromise;
}

export async function isOnboardingBriefingPrompt(
	text: string,
): Promise<boolean> {
	const hash = await getOnboardingBriefingPromptHash();
	const candidate = await sha256Hex(normalizeOnboardingBriefingPrompt(text), 0);
	return hash === candidate;
}

export async function getOnboardingBriefingKvState(
	kv: KVNamespace,
	userId: string,
): Promise<OnboardingBriefingKvState | null> {
	const raw = await kv.get(onboardingBriefingKey(userId));
	if (raw === "pending" || raw === "consumed") return raw;
	return null;
}

function parseUserSettings(raw: unknown): UserSettings {
	if (!raw || typeof raw !== "object") return {};
	return raw as UserSettings;
}

export async function isOnboardingIncomplete(
	env: Env,
	userId: string,
): Promise<boolean> {
	const row = await env.DB.prepare(
		`SELECT settings FROM user WHERE id = ?1 LIMIT 1;`,
	)
		.bind(userId)
		.first<{ settings: unknown }>();
	if (!row) return false;
	const settings = parseUserSettings(row.settings);
	const completedAt = settings.onboardingCompletedAt;
	return completedAt == null || completedAt === "";
}

export async function isWithinOnboardingBriefingAccountAge(
	env: Env,
	userId: string,
	now = Date.now(),
): Promise<boolean> {
	const row = await env.DB.prepare(
		`SELECT created_at FROM user WHERE id = ?1 LIMIT 1;`,
	)
		.bind(userId)
		.first<{ created_at: number }>();
	if (!row?.created_at) return false;
	const createdMs = row.created_at * 1000;
	return now - createdMs <= ONBOARDING_BRIEFING_ACCOUNT_MAX_AGE_MS;
}

export async function isOnboardingBriefingFeatureEnabled(
	env: Env,
	request: Request | undefined,
	userId: string,
): Promise<boolean> {
	if (!request) return false;
	const flagContext = buildFlagContext(request, env, {
		user: { id: userId },
	});
	return isFeatureEnabled(env, "copilot-onboarding-free", flagContext);
}

export interface OnboardingBriefingEligibilityInput {
	env: Env;
	userId: string;
	tier: string;
	request?: Request;
}

export async function isEligibleForOnboardingBriefing(
	input: OnboardingBriefingEligibilityInput,
): Promise<boolean> {
	const { env, userId, tier, request } = input;
	if (tier === "crew_member") return false;
	if (!isIosCopilotClient(request)) return false;
	if (!(await isOnboardingBriefingFeatureEnabled(env, request, userId))) {
		return false;
	}
	const kvState = await getOnboardingBriefingKvState(env.RATION_KV, userId);
	if (kvState === "consumed") return false;
	if (!(await isOnboardingIncomplete(env, userId))) return false;
	if (!(await isWithinOnboardingBriefingAccountAge(env, userId))) {
		return false;
	}
	return true;
}

export async function claimOnboardingBriefing(
	env: Env,
	userId: string,
): Promise<boolean> {
	const key = onboardingBriefingKey(userId);
	const existing = await env.RATION_KV.get(key);
	if (existing === "consumed") return false;
	if (existing === "pending") return true;
	await env.RATION_KV.put(key, "pending", {
		expirationTtl: ONBOARDING_BRIEFING_PENDING_TTL_SEC,
	});
	return true;
}

export async function finalizeOnboardingBriefing(
	env: Env,
	userId: string,
): Promise<void> {
	await env.RATION_KV.put(onboardingBriefingKey(userId), "consumed");
}

export function getOnboardingBriefingSystemPromptAppend(): string {
	return [
		"",
		"Onboarding briefing mode (one-time welcome):",
		"- This is the user's only free welcome response. Reply in under 300 words.",
		"- Do not mention pricing, promo codes, credits, or subscriptions.",
		"- Explain what Ration is and how Cargo, Galley, Manifest, and Supply connect.",
		"- End with one concrete next step: add pantry items in Cargo on iOS.",
		"- No tools are available for this turn.",
	].join("\n");
}

/** Status helper — true when user may still receive the one-time briefing grant. */
export async function getOnboardingBriefingStatus(
	env: Env,
	input: OnboardingBriefingEligibilityInput,
): Promise<{ eligible: boolean; consumed: boolean }> {
	const consumed =
		(await getOnboardingBriefingKvState(env.RATION_KV, input.userId)) ===
		"consumed";
	if (consumed) return { eligible: false, consumed: true };
	const eligible = await isEligibleForOnboardingBriefing(input);
	return { eligible, consumed: false };
}
