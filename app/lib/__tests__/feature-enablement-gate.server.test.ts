import { beforeEach, describe, expect, it, vi } from "vitest";

const isFeatureEnabled = vi.fn();
const requireAIConsent = vi.fn();

vi.mock("~/lib/feature-flags/flags.server", () => ({
	isFeatureEnabled: (...args: unknown[]) => isFeatureEnabled(...args),
}));

vi.mock("~/lib/ai-consent.server", () => ({
	requireAIConsent: (...args: unknown[]) => requireAIConsent(...args),
}));

describe("requireWebAIConsentIfEnabled", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("skips requireAIConsent when feature-enablement-consent is off", async () => {
		isFeatureEnabled.mockResolvedValue(false);
		const { requireWebAIConsentIfEnabled } = await import(
			"~/lib/feature-enablement-gate.server"
		);
		await requireWebAIConsentIfEnabled({} as Env, "user_1", {} as never);
		expect(requireAIConsent).not.toHaveBeenCalled();
	});

	it("requires AI consent when feature-enablement-consent is on", async () => {
		isFeatureEnabled.mockResolvedValue(true);
		requireAIConsent.mockResolvedValue(undefined);
		const { requireWebAIConsentIfEnabled } = await import(
			"~/lib/feature-enablement-gate.server"
		);
		await requireWebAIConsentIfEnabled(
			{ DB: {} } as Env,
			"user_1",
			{} as never,
		);
		expect(requireAIConsent).toHaveBeenCalledWith({}, "user_1");
	});
});
