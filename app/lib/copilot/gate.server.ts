import {
	AI_COSTS,
	checkBalance,
	deductCredits,
	withCreditGate,
} from "../ledger.server";
import type { CopilotAuthSource } from "./auth.server";
import {
	COPILOT_CONVERSATION_FLOOR_COST,
	COPILOT_SESSION_IDLE_MS,
	COPILOT_SESSION_MAX_TOKENS,
	COPILOT_TOKENS_PER_CREDIT,
	CREW_COPILOT_DAILY_CONVERSATIONS,
	creditsForCopilotTokens,
	FREE_TIER_DAILY_CONVERSATIONS,
} from "./constants";
import type { CopilotModelPreset } from "./model-profiles";
import {
	claimOnboardingBriefing,
	getOnboardingBriefingStatus,
	isEligibleForOnboardingBriefing,
} from "./onboarding-briefing.server";

const ALLOWANCE_KEY_PREFIX = "copilot:allowance";
const AUTO_DEDUCT_KEY_PREFIX = "copilot:auto-deduct";
const CONVERSATION_KEY_PREFIX = "copilot:conversation";
const COPILOT_LEDGER_REASON = "Copilot";

export class CopilotNeedsConsentError extends Error {
	override name = "CopilotNeedsConsentError" as const;
	resetAt: string;

	constructor(resetAt: string) {
		super("Copilot auto-deduct consent required");
		this.resetAt = resetAt;
	}
}

export type CopilotChargeMode = "allowance" | "credits" | "onboarding_briefing";

export interface CopilotGateIdentity {
	organizationId: string;
	userId: string;
	tier: string;
}

export interface CopilotConversationCharge {
	mode: CopilotChargeMode;
	preauthorizedCredits: number;
	bracketCreditsCharged: number;
	modelPreset?: CopilotModelPreset;
	onboardingTurnsUsed?: number;
	onboardingConsumed?: boolean;
}

export interface OpenCopilotConversationOptions {
	autoDeductConsent?: boolean;
	request?: Request;
	source?: CopilotAuthSource;
}

function isCrewTier(tier: string | null | undefined): boolean {
	return tier === "crew_member";
}

function nextUtcMidnight(now = new Date()): Date {
	return new Date(
		Date.UTC(
			now.getUTCFullYear(),
			now.getUTCMonth(),
			now.getUTCDate() + 1,
			0,
			0,
			0,
			0,
		),
	);
}

function secondsUntil(date: Date, now = new Date()): number {
	return Math.max(1, Math.ceil((date.getTime() - now.getTime()) / 1000));
}

function allowanceKey(organizationId: string): string {
	return `${ALLOWANCE_KEY_PREFIX}:${organizationId}`;
}

function autoDeductKey(organizationId: string, userId: string): string {
	return `${AUTO_DEDUCT_KEY_PREFIX}:${organizationId}:${userId}`;
}

function conversationKey(
	organizationId: string,
	conversationId: string,
): string {
	return `${CONVERSATION_KEY_PREFIX}:${organizationId}:${conversationId}`;
}

async function getAllowanceUsed(
	kv: KVNamespace,
	organizationId: string,
): Promise<number> {
	const raw = await kv.get(allowanceKey(organizationId));
	const parsed = raw ? Number.parseInt(raw, 10) : 0;
	return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

async function incrementAllowanceUsed(
	kv: KVNamespace,
	organizationId: string,
	resetAt: Date,
): Promise<void> {
	const used = await getAllowanceUsed(kv, organizationId);
	await kv.put(allowanceKey(organizationId), String(used + 1), {
		expirationTtl: secondsUntil(resetAt),
	});
}

export async function getCopilotAutoDeductConsent(
	env: Env,
	identity: Pick<CopilotGateIdentity, "organizationId" | "userId">,
): Promise<boolean> {
	const value = await env.RATION_KV.get(
		autoDeductKey(identity.organizationId, identity.userId),
	);
	return value === "true";
}

export async function setCopilotAutoDeductConsent(
	env: Env,
	identity: Pick<CopilotGateIdentity, "organizationId" | "userId">,
	enabled: boolean,
): Promise<void> {
	await env.RATION_KV.put(
		autoDeductKey(identity.organizationId, identity.userId),
		enabled ? "true" : "false",
	);
}

export async function getCopilotStatus(
	env: Env,
	identity: CopilotGateIdentity,
	options?: { request?: Request },
) {
	const resetAt = nextUtcMidnight();
	const allowanceLimit = isCrewTier(identity.tier)
		? CREW_COPILOT_DAILY_CONVERSATIONS
		: FREE_TIER_DAILY_CONVERSATIONS;
	const used = await getAllowanceUsed(env.RATION_KV, identity.organizationId);
	const freeConversationsRemaining = Math.max(0, allowanceLimit - used);
	const [creditBalance, autoDeductConsent, onboardingBriefing] =
		await Promise.all([
			checkBalance(env, identity.organizationId),
			getCopilotAutoDeductConsent(env, identity),
			getOnboardingBriefingStatus(env, {
				env,
				userId: identity.userId,
				tier: identity.tier,
				request: options?.request,
			}),
		]);

	return {
		tier: identity.tier,
		freeConversationsRemaining,
		allowanceResetAt: resetAt.toISOString(),
		creditBalance,
		autoDeductConsent,
		conversationFloorCost: COPILOT_CONVERSATION_FLOOR_COST,
		sessionIdleMs: COPILOT_SESSION_IDLE_MS,
		tokensPerCredit: COPILOT_TOKENS_PER_CREDIT,
		sessionMaxTokens: COPILOT_SESSION_MAX_TOKENS,
		onboardingBriefingEligible: onboardingBriefing.eligible,
		onboardingBriefingConsumed: onboardingBriefing.consumed,
	};
}

export async function openCopilotConversation(
	env: Env,
	identity: CopilotGateIdentity,
	options?: OpenCopilotConversationOptions,
): Promise<CopilotConversationCharge> {
	if (
		options?.source === "mobile" &&
		(await isEligibleForOnboardingBriefing({
			env,
			userId: identity.userId,
			tier: identity.tier,
			request: options.request,
		}))
	) {
		const claimed = await claimOnboardingBriefing(env, identity.userId);
		if (claimed) {
			return {
				mode: "onboarding_briefing",
				preauthorizedCredits: 0,
				bracketCreditsCharged: 0,
				onboardingTurnsUsed: 0,
				onboardingConsumed: false,
			};
		}
	}

	const resetAt = nextUtcMidnight();
	if (isCrewTier(identity.tier)) {
		const used = await getAllowanceUsed(env.RATION_KV, identity.organizationId);
		if (used < CREW_COPILOT_DAILY_CONVERSATIONS) {
			await incrementAllowanceUsed(
				env.RATION_KV,
				identity.organizationId,
				resetAt,
			);
			return {
				mode: "allowance",
				preauthorizedCredits: 0,
				bracketCreditsCharged: 0,
			};
		}

		const autoDeductConsent =
			options?.autoDeductConsent ??
			(await getCopilotAutoDeductConsent(env, identity));
		if (!autoDeductConsent) {
			throw new CopilotNeedsConsentError(resetAt.toISOString());
		}
	}

	return withCreditGate(
		{
			env,
			organizationId: identity.organizationId,
			userId: identity.userId,
			cost: AI_COSTS.COPILOT_TURN,
			reason: COPILOT_LEDGER_REASON,
		},
		async () => ({
			mode: "credits" as const,
			preauthorizedCredits: AI_COSTS.COPILOT_TURN,
			bracketCreditsCharged: AI_COSTS.COPILOT_TURN,
		}),
	);
}

export async function getConversationCharge(
	env: Env,
	organizationId: string,
	conversationId: string,
): Promise<CopilotConversationCharge | null> {
	const key = conversationKey(organizationId, conversationId);
	const existing = await env.RATION_KV.get(key, "json");
	if (
		existing &&
		typeof existing === "object" &&
		"mode" in existing &&
		"bracketCreditsCharged" in existing
	) {
		return existing as CopilotConversationCharge;
	}
	return null;
}

export async function persistConversationCharge(
	env: Env,
	organizationId: string,
	conversationId: string,
	charge: CopilotConversationCharge,
): Promise<void> {
	await env.RATION_KV.put(
		conversationKey(organizationId, conversationId),
		JSON.stringify(charge),
		{ expirationTtl: Math.ceil(COPILOT_SESSION_IDLE_MS / 1000) },
	);
}

export async function ensureCopilotConversationOpen(
	env: Env,
	identity: CopilotGateIdentity,
	conversationId: string,
	options?: OpenCopilotConversationOptions,
): Promise<CopilotConversationCharge> {
	const key = conversationKey(identity.organizationId, conversationId);
	const existing = await env.RATION_KV.get(key, "json");
	if (
		existing &&
		typeof existing === "object" &&
		"mode" in existing &&
		"bracketCreditsCharged" in existing
	) {
		await env.RATION_KV.put(key, JSON.stringify(existing), {
			expirationTtl: Math.ceil(COPILOT_SESSION_IDLE_MS / 1000),
		});
		return existing as CopilotConversationCharge;
	}

	const charge = await openCopilotConversation(env, identity, options);
	await persistConversationCharge(
		env,
		identity.organizationId,
		conversationId,
		charge,
	);
	return charge;
}

export async function reconcileCopilotConversationUsage(
	env: Env,
	identity: CopilotGateIdentity,
	charge: CopilotConversationCharge,
	totalTokens: number,
	conversationId?: string,
): Promise<CopilotConversationCharge> {
	if (charge.mode === "allowance" || charge.mode === "onboarding_briefing") {
		return charge;
	}

	const targetCredits = creditsForCopilotTokens(totalTokens);
	const delta = targetCredits - charge.bracketCreditsCharged;
	if (delta <= 0) return charge;

	const bracketReason = conversationId
		? `${COPILOT_LEDGER_REASON}:${conversationId}:bracket:${targetCredits}`
		: COPILOT_LEDGER_REASON;
	if (conversationId) {
		const existing = await env.DB.prepare(
			`SELECT id FROM ledger
			WHERE organization_id = ?1 AND reason = ?2
			LIMIT 1;`,
		)
			.bind(identity.organizationId, bracketReason)
			.first();
		if (existing) {
			return {
				...charge,
				bracketCreditsCharged: targetCredits,
			};
		}
	}

	await deductCredits(
		env,
		identity.organizationId,
		identity.userId,
		delta,
		bracketReason,
	);

	return {
		...charge,
		bracketCreditsCharged: targetCredits,
	};
}

export async function reconcileAndPersistCopilotConversationUsage(
	env: Env,
	identity: CopilotGateIdentity,
	conversationId: string,
	totalTokens: number,
): Promise<CopilotConversationCharge> {
	const charge = await ensureCopilotConversationOpen(
		env,
		identity,
		conversationId,
	);
	const nextCharge = await reconcileCopilotConversationUsage(
		env,
		identity,
		charge,
		totalTokens,
		conversationId,
	);
	if (nextCharge !== charge) {
		await env.RATION_KV.put(
			conversationKey(identity.organizationId, conversationId),
			JSON.stringify(nextCharge),
			{ expirationTtl: Math.ceil(COPILOT_SESSION_IDLE_MS / 1000) },
		);
	}
	return nextCharge;
}
