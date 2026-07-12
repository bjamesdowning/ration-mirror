import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	ONBOARDING_BRIEFING_ACCOUNT_MAX_AGE_MS,
	ONBOARDING_BRIEFING_BOOTSTRAP_PROMPT,
} from "../copilot/constants";
import {
	claimOnboardingBriefing,
	finalizeOnboardingBriefing,
	getOnboardingBriefingKvState,
	isEligibleForOnboardingBriefing,
	isIosCopilotClient,
	isOnboardingBriefingPrompt,
	onboardingBriefingKey,
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

	it("matches canonical bootstrap prompt hash", async () => {
		expect(
			await isOnboardingBriefingPrompt(ONBOARDING_BRIEFING_BOOTSTRAP_PROMPT),
		).toBe(true);
		expect(await isOnboardingBriefingPrompt("tell me a joke")).toBe(false);
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

	it("rejects completed onboarding", async () => {
		const kv = new MemoryKV();
		const nowSec = Math.floor(Date.now() / 1000);
		const eligible = await isEligibleForOnboardingBriefing({
			env: env(kv, {
				settings: { onboardingCompletedAt: "2026-01-01T00:00:00.000Z" },
				created_at: nowSec,
			}),
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

	it("claims pending then finalizes consumed", async () => {
		const kv = new MemoryKV();
		const e = { RATION_KV: kv } as unknown as Env;
		expect(await claimOnboardingBriefing(e, "user_1")).toBe(true);
		expect(
			await getOnboardingBriefingKvState(
				kv as unknown as KVNamespace,
				"user_1",
			),
		).toBe("pending");
		expect(await claimOnboardingBriefing(e, "user_1")).toBe(true);
		await finalizeOnboardingBriefing(e, "user_1");
		expect(
			await getOnboardingBriefingKvState(
				kv as unknown as KVNamespace,
				"user_1",
			),
		).toBe("consumed");
		expect(await claimOnboardingBriefing(e, "user_1")).toBe(false);
	});
});
