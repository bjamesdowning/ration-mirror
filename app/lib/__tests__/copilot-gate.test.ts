import { beforeEach, describe, expect, it, vi } from "vitest";

const ledger = vi.hoisted(() => ({
	checkBalance: vi.fn(async () => 10),
	deductCredits: vi.fn(async () => undefined),
	withCreditGate: vi.fn(async (_options, operation: () => Promise<unknown>) =>
		operation(),
	),
}));

vi.mock("../ledger.server", () => ({
	AI_COSTS: { COPILOT_TURN: 1 },
	checkBalance: ledger.checkBalance,
	deductCredits: ledger.deductCredits,
	withCreditGate: ledger.withCreditGate,
}));

import {
	CopilotNeedsConsentError,
	getCopilotStatus,
	openCopilotConversation,
	reconcileCopilotConversationUsage,
	setCopilotAutoDeductConsent,
} from "../copilot/gate.server";
import { finalizeOnboardingBriefing } from "../copilot/onboarding-briefing.server";

vi.mock("../feature-flags/flags.server", () => ({
	buildFlagContext: vi.fn(() => ({})),
	isFeatureEnabled: vi.fn(async () => true),
}));

class MemoryKV {
	store = new Map<string, string>();

	async get(key: string, type?: "json") {
		const value = this.store.get(key) ?? null;
		if (type === "json") return value ? JSON.parse(value) : null;
		return value;
	}

	async put(key: string, value: string) {
		this.store.set(key, value);
	}
}

function env(userRow?: { settings: unknown; created_at: number }) {
	const kv = new MemoryKV();
	const nowSec = Math.floor(Date.now() / 1000);
	const row = userRow ?? { settings: {}, created_at: nowSec };
	const db = {
		prepare: (sql: string) => ({
			bind: (..._args: unknown[]) => ({
				first: async () => {
					if (sql.includes("settings")) return { settings: row.settings };
					if (sql.includes("created_at")) return { created_at: row.created_at };
					return null;
				},
			}),
		}),
	};
	return {
		RATION_KV: kv,
		DB: db,
	} as unknown as Env;
}

function iosRequest(): Request {
	return new Request("https://ration.mayutic.com/copilot/test", {
		headers: { "X-Ration-Client": "ios/1.5.60" },
	});
}

const identity = {
	userId: "user_1",
	organizationId: "org_1",
	tier: "crew_member",
};

describe("copilot gate", () => {
	beforeEach(() => {
		ledger.checkBalance.mockClear();
		ledger.deductCredits.mockClear();
		ledger.withCreditGate.mockClear();
	});

	it("uses one Crew allowance conversation before credits", async () => {
		const e = env();
		for (let i = 0; i < 1; i += 1) {
			const charge = await openCopilotConversation(e, identity);
			expect(charge.mode).toBe("allowance");
		}

		await expect(openCopilotConversation(e, identity)).rejects.toBeInstanceOf(
			CopilotNeedsConsentError,
		);
	});

	it("deducts after allowance when consent is enabled", async () => {
		const e = env();
		for (let i = 0; i < 1; i += 1) {
			await openCopilotConversation(e, identity);
		}
		await setCopilotAutoDeductConsent(e, identity, true);
		const charge = await openCopilotConversation(e, identity);
		expect(charge.mode).toBe("credits");
		expect(ledger.withCreditGate).toHaveBeenCalledTimes(1);
	});

	it("reports remaining allowance and credit balance", async () => {
		const e = env();
		await openCopilotConversation(e, identity);
		const status = await getCopilotStatus(e, identity);
		expect(status.freeConversationsRemaining).toBe(0);
		expect(status.creditBalance).toBe(10);
	});

	it("deducts only incremental credit deltas for linear billing", async () => {
		const e = env();
		const next = await reconcileCopilotConversationUsage(
			e,
			identity,
			{ mode: "credits", preauthorizedCredits: 1, bracketCreditsCharged: 1 },
			30_001,
		);
		expect(next.bracketCreditsCharged).toBe(2);
		expect(ledger.deductCredits).toHaveBeenCalledWith(
			e,
			"org_1",
			"user_1",
			1,
			"Copilot",
		);
	});

	it("opens onboarding briefing for eligible iOS free users until consumed", async () => {
		const e = env();
		const charge = await openCopilotConversation(
			e,
			{ userId: "user_ios", organizationId: "org_1", tier: "free" },
			{ source: "mobile", request: iosRequest() },
		);
		expect(charge.mode).toBe("onboarding_briefing");
		expect(charge.onboardingConsumed).toBe(false);

		await finalizeOnboardingBriefing(e, "user_ios");
		const second = await openCopilotConversation(
			e,
			{ userId: "user_ios", organizationId: "org_1", tier: "free" },
			{ source: "mobile", request: iosRequest() },
		);
		expect(second.mode).toBe("credits");
	});

	it("reports onboarding briefing eligibility in status", async () => {
		const e = env();
		const status = await getCopilotStatus(
			e,
			{ userId: "user_ios", organizationId: "org_1", tier: "free" },
			{ request: iosRequest() },
		);
		expect(status.onboardingBriefingEligible).toBe(true);
		expect(status.onboardingBriefingConsumed).toBe(false);
	});

	it("skips token reconciliation for onboarding briefing", async () => {
		const e = env();
		const unchanged = await reconcileCopilotConversationUsage(
			e,
			identity,
			{
				mode: "onboarding_briefing",
				preauthorizedCredits: 0,
				bracketCreditsCharged: 0,
				onboardingTurnsUsed: 1,
				onboardingConsumed: true,
			},
			30_001,
		);
		expect(unchanged.mode).toBe("onboarding_briefing");
		expect(ledger.deductCredits).not.toHaveBeenCalled();
	});
});
