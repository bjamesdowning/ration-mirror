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

function env() {
	return {
		RATION_KV: new MemoryKV(),
	} as unknown as Env;
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

	it("uses three Crew allowance conversations before credits", async () => {
		const e = env();
		for (let i = 0; i < 3; i += 1) {
			const charge = await openCopilotConversation(e, identity);
			expect(charge.mode).toBe("allowance");
		}

		await expect(openCopilotConversation(e, identity)).rejects.toBeInstanceOf(
			CopilotNeedsConsentError,
		);
	});

	it("deducts after allowance when consent is enabled", async () => {
		const e = env();
		for (let i = 0; i < 3; i += 1) {
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
		expect(status.freeConversationsRemaining).toBe(2);
		expect(status.creditBalance).toBe(10);
	});

	it("deducts only incremental bracket deltas", async () => {
		const e = env();
		const next = await reconcileCopilotConversationUsage(
			e,
			identity,
			{ mode: "credits", preauthorizedCredits: 1, bracketCreditsCharged: 1 },
			30_001,
		);
		expect(next.bracketCreditsCharged).toBe(3);
		expect(ledger.deductCredits).toHaveBeenCalledWith(
			e,
			"org_1",
			"user_1",
			2,
			"Copilot",
		);
	});
});
