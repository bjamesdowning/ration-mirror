import { sha256Hex } from "../crypto.server";
import {
	buildFlagContext,
	isFeatureEnabled,
} from "../feature-flags/flags.server";
import type { UserSettings } from "../types";
import {
	COPILOT_SESSION_IDLE_MS,
	ONBOARDING_BRIEFING_ACCOUNT_MAX_AGE_MS,
	ONBOARDING_BRIEFING_BOOTSTRAP_PROMPT,
	ONBOARDING_BRIEFING_MAX_TURNS,
	ONBOARDING_BRIEFING_SEED_MAX_STEPS,
	ONBOARDING_BRIEFING_SEED_PROMPT,
} from "./constants";

const ONBOARDING_BRIEFING_KV_PREFIX = "copilot:onboarding-briefing";
const PENDING_PREFIX = "pending:";

export type OnboardingBriefingKvState = "pending" | "consumed";

export type OnboardingBriefingTurn = "bootstrap" | "seed";

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

const promptHashCache = new Map<string, Promise<string>>();

function promptHash(prompt: string): Promise<string> {
	const normalized = normalizeOnboardingBriefingPrompt(prompt);
	let pending = promptHashCache.get(normalized);
	if (!pending) {
		pending = sha256Hex(normalized, 0);
		promptHashCache.set(normalized, pending);
	}
	return pending;
}

/** @deprecated Prefer resolveOnboardingBriefingTurn — kept for bootstrap-hash callers. */
export function getOnboardingBriefingPromptHash(): Promise<string> {
	return promptHash(ONBOARDING_BRIEFING_BOOTSTRAP_PROMPT);
}

export async function resolveOnboardingBriefingTurn(
	text: string,
): Promise<OnboardingBriefingTurn | null> {
	const candidate = await sha256Hex(normalizeOnboardingBriefingPrompt(text), 0);
	const bootstrap = await promptHash(ONBOARDING_BRIEFING_BOOTSTRAP_PROMPT);
	if (candidate === bootstrap) return "bootstrap";
	const seed = await promptHash(ONBOARDING_BRIEFING_SEED_PROMPT);
	if (candidate === seed) return "seed";
	return null;
}

export async function isOnboardingBriefingPrompt(
	text: string,
): Promise<boolean> {
	return (await resolveOnboardingBriefingTurn(text)) !== null;
}

/**
 * Maps charge turn progress + allowlisted prompt to the expected briefing turn.
 * Turn 0 → bootstrap only; turn 1 → seed only.
 */
export async function resolveAllowedOnboardingBriefingTurn(input: {
	userText: string;
	turnsUsed: number;
}): Promise<OnboardingBriefingTurn | null> {
	const turn = await resolveOnboardingBriefingTurn(input.userText);
	if (!turn) return null;
	if (input.turnsUsed === 0 && turn === "bootstrap") return "bootstrap";
	if (input.turnsUsed === 1 && turn === "seed") return "seed";
	return null;
}

export function getOnboardingBriefingTurnPolicy(turn: OnboardingBriefingTurn): {
	activeTools: string[];
	maxSteps: number;
} {
	if (turn === "seed") {
		return {
			activeTools: ["add_cargo_item"],
			maxSteps: ONBOARDING_BRIEFING_SEED_MAX_STEPS,
		};
	}
	return { activeTools: [], maxSteps: 1 };
}

function parseKvState(raw: string | null): OnboardingBriefingKvState | null {
	if (raw === "consumed") return "consumed";
	if (raw === "pending" || raw?.startsWith(PENDING_PREFIX)) return "pending";
	return null;
}

export function parsePendingConversationId(raw: string | null): string | null {
	if (!raw?.startsWith(PENDING_PREFIX)) return null;
	const id = raw.slice(PENDING_PREFIX.length);
	return id.length > 0 ? id : null;
}

export async function getOnboardingBriefingKvState(
	kv: KVNamespace,
	userId: string,
): Promise<OnboardingBriefingKvState | null> {
	return parseKvState(await kv.get(onboardingBriefingKey(userId)));
}

/** Exported for unit tests — parse D1 `user.settings` which may be a JSON string. */
export function parseUserSettings(raw: unknown): UserSettings {
	if (raw == null) return {};
	if (typeof raw === "string") {
		try {
			const parsed: unknown = JSON.parse(raw);
			if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
				return parsed as UserSettings;
			}
			return {};
		} catch {
			return {};
		}
	}
	if (typeof raw === "object" && !Array.isArray(raw)) {
		return raw as UserSettings;
	}
	return {};
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
	// Better Auth stores unix seconds; ignore absurd ms-shaped values defensively.
	const createdMs =
		row.created_at > 1_000_000_000_000 ? row.created_at : row.created_at * 1000;
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

const PENDING_TTL_SEC = Math.ceil(COPILOT_SESSION_IDLE_MS / 1000);

/**
 * Bind a one-time free briefing grant to a single conversation.
 * Rejects additional conversationIds while pending to prevent free-grant spam.
 */
export async function claimOnboardingBriefing(
	env: Env,
	userId: string,
	conversationId: string,
): Promise<boolean> {
	if (!conversationId) return false;
	const key = onboardingBriefingKey(userId);
	const existing = await env.RATION_KV.get(key);
	if (existing === "consumed") return false;
	const boundId = parsePendingConversationId(existing);
	if (boundId) return boundId === conversationId;
	if (existing === "pending") {
		await env.RATION_KV.put(key, `${PENDING_PREFIX}${conversationId}`, {
			expirationTtl: PENDING_TTL_SEC,
		});
		return true;
	}
	await env.RATION_KV.put(key, `${PENDING_PREFIX}${conversationId}`, {
		expirationTtl: PENDING_TTL_SEC,
	});
	return true;
}

export async function finalizeOnboardingBriefing(
	env: Env,
	userId: string,
): Promise<void> {
	await env.RATION_KV.put(onboardingBriefingKey(userId), "consumed");
}

export function getOnboardingBriefingSystemPromptAppend(
	turn: OnboardingBriefingTurn = "bootstrap",
): string {
	if (turn === "seed") {
		return [
			"",
			"Onboarding briefing mode (turn 2 — starter seed):",
			"- Execute the user's pantry seed request using add_cargo_item for each item.",
			'- Use temporal context to convert relative expiry ("2 weeks") to ISO expiresAt strings.',
			"- Apply tags only where the user specified them.",
			'- Use domain "food" for all items.',
			"- If an item fails, continue with the rest and report partial success.",
			"- Reply in under 200 words summarizing what was added, with expiry/tag highlights.",
			"- Do not mention pricing or credits.",
		].join("\n");
	}
	return [
		"",
		"Onboarding briefing mode (turn 1 — intro):",
		"- Reply in under 150 words.",
		"- Explain what Ration is in plain language and how Cargo, Galley, Manifest, and Supply connect.",
		"- Do not mention pricing, credits, or subscriptions.",
		'- End by inviting the user to tap "Stock my kitchen" to try Copilot with their pantry.',
		"- No tools are available for this turn.",
	].join("\n");
}

export function isOnboardingBriefingExhausted(turnsUsed: number): boolean {
	return turnsUsed >= ONBOARDING_BRIEFING_MAX_TURNS;
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
