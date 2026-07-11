import { beforeEach, describe, expect, it, vi } from "vitest";

const requireMobileActiveGroup = vi.fn();
const checkRateLimit = vi.fn();
const getUserSettings = vi.fn();
const writeUserSettings = vi.fn();
const patchUserSettings = vi.fn();

vi.mock("~/lib/mobile/auth.server", () => ({
	requireMobileActiveGroup: (...args: unknown[]) =>
		requireMobileActiveGroup(...args),
}));

vi.mock("~/lib/rate-limiter.server", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("~/lib/rate-limiter.server")>();
	return {
		...actual,
		checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
	};
});

vi.mock("~/lib/auth.server", () => ({
	getUserSettings: (...args: unknown[]) => getUserSettings(...args),
	writeUserSettings: (...args: unknown[]) => writeUserSettings(...args),
	patchUserSettings: (...args: unknown[]) => patchUserSettings(...args),
}));

const ctx = { cloudflare: { env: { DB: {}, RATION_KV: {} } } } as never;

function patchRequest(body: unknown) {
	return new Request("https://ration.mayutic.com/api/mobile/v1/settings", {
		method: "PATCH",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}

describe("PATCH /api/mobile/v1/settings", () => {
	beforeEach(() => {
		for (const m of [
			requireMobileActiveGroup,
			checkRateLimit,
			getUserSettings,
			writeUserSettings,
			patchUserSettings,
		]) {
			m.mockReset();
		}
		requireMobileActiveGroup.mockResolvedValue({
			userId: "user_1",
			organizationId: "org_1",
		});
		checkRateLimit.mockResolvedValue({ allowed: true });
	});

	it("restartOnboarding clears completion and resets step to 0", async () => {
		const current = {
			onboardingCompletedAt: "2026-01-01T00:00:00.000Z",
			onboardingStep: 4,
			theme: "dark",
		};
		const cleared = { theme: "dark", onboardingStep: 0 };

		getUserSettings
			.mockResolvedValueOnce(current)
			.mockResolvedValueOnce(cleared);

		const { action } = await import("~/routes/api/mobile/v1.settings");
		const response = await action({
			request: patchRequest({ restartOnboarding: true }),
			context: ctx,
			params: {},
		} as never);

		expect(writeUserSettings).toHaveBeenCalledWith({}, "user_1", {
			...current,
			onboardingCompletedAt: undefined,
			onboardingStep: 0,
		});
		expect(patchUserSettings).not.toHaveBeenCalled();
		expect(response).toEqual({ settings: cleared });
	});

	it("applies regular patches when restartOnboarding is absent", async () => {
		const updated = { onboardingStep: 2 };
		getUserSettings.mockResolvedValue(updated);

		const { action } = await import("~/routes/api/mobile/v1.settings");
		await action({
			request: patchRequest({ onboardingStep: 2 }),
			context: ctx,
			params: {},
		} as never);

		expect(patchUserSettings).toHaveBeenCalled();
		expect(writeUserSettings).not.toHaveBeenCalled();
	});
});
