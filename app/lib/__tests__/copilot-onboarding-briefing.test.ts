import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	ONBOARDING_BRIEFING_ACCOUNT_MAX_AGE_MS,
	ONBOARDING_BRIEFING_BOOTSTRAP_PROMPT,
	ONBOARDING_BRIEFING_INTRO_MAX_STEPS,
	ONBOARDING_BRIEFING_MAX_TURNS,
	ONBOARDING_BRIEFING_SEED_MAX_STEPS,
	ONBOARDING_BRIEFING_SEED_PROMPT,
} from "../copilot/constants";
import {
	claimOnboardingBriefing,
	finalizeOnboardingBriefing,
	getOnboardingBriefingKvState,
	getOnboardingBriefingSystemPromptAppend,
	getOnboardingBriefingTurnPolicy,
	isEligibleForOnboardingBriefing,
	isIosCopilotClient,
	isOnboardingAgentStepContinuing,
	isOnboardingBriefingExhausted,
	isOnboardingBriefingPrompt,
	isOnboardingIncomplete,
	onboardingBriefingKey,
	parseUserSettings,
	resolveAllowedOnboardingBriefingTurn,
	resolveOnboardingBriefingTurn,
} from "../copilot/onboarding-briefing.server";

vi.mock("../feature-flags/flags.server", () => ({
	buildFlagContext: vi.fn(() => ({})),
	isFeatureEnabled: vi.fn(async () => true),
}));

class MemoryKV {
	store = new Map<string, string>();

	async get(key: string) {
		return this.store.get(key) ?? null;
	}

	async put(key: string, value: string, _options?: { expirationTtl?: number }) {
		this.store.set(key, value);
	}
}

function env(kv: MemoryKV, userRow: { settings: unknown; created_at: number }) {
	const db = {
		prepare: (sql: string) => ({
			bind: (..._args: unknown[]) => ({
				first: async () => {
					if (sql.includes("settings")) {
						return { settings: userRow.settings };
					}
					if (sql.includes("created_at")) {
						return { created_at: userRow.created_at };
					}
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
	return new Request(
		"https://ration.mayutic.com/api/mobile/v1/copilot/status",
		{
			headers: { "X-Ration-Client": "ios/1.5.60" },
		},
	);
}

describe("onboarding briefing", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("detects iOS client header", () => {
		expect(isIosCopilotClient(iosRequest())).toBe(true);
		expect(isIosCopilotClient(new Request("https://x"))).toBe(false);
	});

	it("parses D1 settings JSON strings", () => {
		expect(
			parseUserSettings('{"onboardingCompletedAt":"2026-01-01T00:00:00.000Z"}')
				.onboardingCompletedAt,
		).toBe("2026-01-01T00:00:00.000Z");
		expect(parseUserSettings("{}")).toEqual({});
		expect(parseUserSettings("not-json")).toEqual({});
		expect(
			parseUserSettings({ onboardingCompletedAt: "2026-01-01T00:00:00.000Z" })
				.onboardingCompletedAt,
		).toBe("2026-01-01T00:00:00.000Z");
	});

	it("matches canonical bootstrap and seed prompt hashes", async () => {
		expect(
			await isOnboardingBriefingPrompt(ONBOARDING_BRIEFING_BOOTSTRAP_PROMPT),
		).toBe(true);
		expect(
			await isOnboardingBriefingPrompt(ONBOARDING_BRIEFING_SEED_PROMPT),
		).toBe(true);
		expect(await isOnboardingBriefingPrompt("tell me a joke")).toBe(false);
		expect(await resolveOnboardingBriefingTurn("What is Ration?")).toBe(
			"bootstrap",
		);
		expect(
			await resolveOnboardingBriefingTurn(ONBOARDING_BRIEFING_SEED_PROMPT),
		).toBe("seed");
	});

	it("routes allowlisted prompts to the correct turn index", async () => {
		expect(
			await resolveAllowedOnboardingBriefingTurn({
				userText: ONBOARDING_BRIEFING_BOOTSTRAP_PROMPT,
				turnsUsed: 0,
			}),
		).toBe("bootstrap");
		expect(
			await resolveAllowedOnboardingBriefingTurn({
				userText: ONBOARDING_BRIEFING_SEED_PROMPT,
				turnsUsed: 1,
			}),
		).toBe("seed");
		expect(
			await resolveAllowedOnboardingBriefingTurn({
				userText: ONBOARDING_BRIEFING_SEED_PROMPT,
				turnsUsed: 0,
			}),
		).toBeNull();
		expect(
			await resolveAllowedOnboardingBriefingTurn({
				userText: ONBOARDING_BRIEFING_BOOTSTRAP_PROMPT,
				turnsUsed: 1,
			}),
		).toBeNull();
	});

	it("exposes intro vs seed tool policy", () => {
		expect(getOnboardingBriefingTurnPolicy("bootstrap")).toEqual({
			activeTools: ["search_docs"],
			maxSteps: ONBOARDING_BRIEFING_INTRO_MAX_STEPS,
		});
		expect(getOnboardingBriefingTurnPolicy("seed")).toEqual({
			activeTools: ["add_cargo_item"],
			maxSteps: ONBOARDING_BRIEFING_SEED_MAX_STEPS,
		});
		expect(isOnboardingBriefingExhausted(0)).toBe(false);
		expect(isOnboardingBriefingExhausted(ONBOARDING_BRIEFING_MAX_TURNS)).toBe(
			true,
		);
		expect(getOnboardingBriefingSystemPromptAppend("bootstrap")).toContain(
			"search_docs",
		);
		expect(getOnboardingBriefingSystemPromptAppend("bootstrap")).toContain(
			"Stock my kitchen",
		);
		expect(getOnboardingBriefingSystemPromptAppend("seed")).toContain(
			"add_cargo_item",
		);
		expect(getOnboardingBriefingSystemPromptAppend("seed")).toContain(
			"exactly one",
		);
	});

	it("defers grant counting while tool steps continue", () => {
		expect(
			isOnboardingAgentStepContinuing({ finishReason: "tool-calls" }),
		).toBe(true);
		expect(
			isOnboardingAgentStepContinuing({
				finishReason: "stop",
				toolCallsLength: 0,
			}),
		).toBe(false);
		expect(
			isOnboardingAgentStepContinuing({
				finishReason: "length",
				toolCallsLength: 0,
			}),
		).toBe(false);
		expect(
			isOnboardingAgentStepContinuing({
				finishReason: undefined,
				toolCallsLength: 2,
			}),
		).toBe(true);
	});

	it("matches iOS OnboardingBriefingCopy prompts to server allowlist", async () => {
		const swiftPath = join(
			process.cwd(),
			"ios/Ration/Features/Onboarding/OnboardingBriefingCopy.swift",
		);
		const swift = readFileSync(swiftPath, "utf8");
		const bootstrapMatch = swift.match(
			/static let bootstrapPrompt = "([^"]+)"/,
		);
		expect(bootstrapMatch?.[1]).toBe(ONBOARDING_BRIEFING_BOOTSTRAP_PROMPT);

		const seedMatch = swift.match(/static let seedPrompt = """\n([\s\S]*?)"""/);
		expect(seedMatch?.[1]).toBeDefined();
		const iosSeed = (seedMatch?.[1] ?? "").replace(/\n$/, "");
		expect(iosSeed).toBe(ONBOARDING_BRIEFING_SEED_PROMPT);
		expect(await resolveOnboardingBriefingTurn(iosSeed)).toBe("seed");
		expect(await resolveOnboardingBriefingTurn(bootstrapMatch?.[1] ?? "")).toBe(
			"bootstrap",
		);
	});

	it("grants eligibility for new iOS free users", async () => {
		const kv = new MemoryKV();
		const nowSec = Math.floor(Date.now() / 1000);
		const eligible = await isEligibleForOnboardingBriefing({
			env: env(kv, { settings: {}, created_at: nowSec }),
			userId: "user_new",
			tier: "free",
			request: iosRequest(),
		});
		expect(eligible).toBe(true);
	});

	it("rejects consumed briefing", async () => {
		const kv = new MemoryKV();
		kv.store.set(onboardingBriefingKey("user_1"), "consumed");
		const nowSec = Math.floor(Date.now() / 1000);
		const eligible = await isEligibleForOnboardingBriefing({
			env: env(kv, { settings: {}, created_at: nowSec }),
			userId: "user_1",
			tier: "free",
			request: iosRequest(),
		});
		expect(eligible).toBe(false);
	});

	it("rejects completed onboarding from JSON string settings", async () => {
		const kv = new MemoryKV();
		const nowSec = Math.floor(Date.now() / 1000);
		const e = env(kv, {
			settings: JSON.stringify({
				onboardingCompletedAt: "2026-01-01T00:00:00.000Z",
			}),
			created_at: nowSec,
		});
		expect(await isOnboardingIncomplete(e, "user_1")).toBe(false);
		const eligible = await isEligibleForOnboardingBriefing({
			env: e,
			userId: "user_1",
			tier: "free",
			request: iosRequest(),
		});
		expect(eligible).toBe(false);
	});

	it("rejects stale accounts beyond age window", async () => {
		const kv = new MemoryKV();
		const staleSec = Math.floor(
			(Date.now() - ONBOARDING_BRIEFING_ACCOUNT_MAX_AGE_MS - 60_000) / 1000,
		);
		const eligible = await isEligibleForOnboardingBriefing({
			env: env(kv, { settings: {}, created_at: staleSec }),
			userId: "user_1",
			tier: "free",
			request: iosRequest(),
		});
		expect(eligible).toBe(false);
	});

	it("binds pending claim to a single conversation id", async () => {
		const kv = new MemoryKV();
		const e = { RATION_KV: kv } as unknown as Env;
		expect(await claimOnboardingBriefing(e, "user_1", "conv_a")).toBe(true);
		expect(
			await getOnboardingBriefingKvState(
				kv as unknown as KVNamespace,
				"user_1",
			),
		).toBe("pending");
		expect(await claimOnboardingBriefing(e, "user_1", "conv_a")).toBe(true);
		expect(await claimOnboardingBriefing(e, "user_1", "conv_b")).toBe(false);
		await finalizeOnboardingBriefing(e, "user_1");
		expect(
			await getOnboardingBriefingKvState(
				kv as unknown as KVNamespace,
				"user_1",
			),
		).toBe("consumed");
		expect(await claimOnboardingBriefing(e, "user_1", "conv_a")).toBe(false);
	});
});
