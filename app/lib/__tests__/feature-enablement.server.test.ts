import { beforeEach, describe, expect, it, vi } from "vitest";

const getUserSettings = vi.fn();
const patchUserSettings = vi.fn();
const getCopilotAutoDeductConsent = vi.fn();
const setCopilotAutoDeductConsent = vi.fn();
const getNutritionConsentStatus = vi.fn();
const grantNutritionConsent = vi.fn();
const withdrawNutritionConsent = vi.fn();
const eraseNutritionData = vi.fn();
const getNutritionConsentStatement = vi.fn();

vi.mock("~/lib/auth.server", () => ({
	getUserSettings: (...args: unknown[]) => getUserSettings(...args),
	patchUserSettings: (...args: unknown[]) => patchUserSettings(...args),
}));

vi.mock("~/lib/copilot/gate.server", () => ({
	getCopilotAutoDeductConsent: (...args: unknown[]) =>
		getCopilotAutoDeductConsent(...args),
	setCopilotAutoDeductConsent: (...args: unknown[]) =>
		setCopilotAutoDeductConsent(...args),
}));

vi.mock("~/lib/nutrition/consent.server", () => ({
	getNutritionConsentStatus: (...args: unknown[]) =>
		getNutritionConsentStatus(...args),
	grantNutritionConsent: (...args: unknown[]) => grantNutritionConsent(...args),
	withdrawNutritionConsent: (...args: unknown[]) =>
		withdrawNutritionConsent(...args),
	eraseNutritionData: (...args: unknown[]) => eraseNutritionData(...args),
}));

vi.mock("~/lib/nutrition/consent-policy", async () => {
	const actual = await vi.importActual<
		typeof import("~/lib/nutrition/consent-policy")
	>("~/lib/nutrition/consent-policy");
	return {
		...actual,
		getNutritionConsentStatement: (...args: unknown[]) =>
			getNutritionConsentStatement(...args),
	};
});

const env = { DB: {} as D1Database, RATION_KV: {} as KVNamespace };
const identity = { userId: "user_1", organizationId: "org_1" };
const meta = {
	source: "web" as const,
	clientSurface: "test",
};

function consent(purpose: string, state: string) {
	return {
		purpose,
		state,
		consentId: state === "active" ? `${purpose}-id` : null,
		grantedAt: null,
		withdrawnAt: null,
		statement: {
			purpose,
			policyVersion: "2026-08-09",
			statementVersion: `${purpose}-v`,
			text: "statement",
			sha256: "a".repeat(64),
			privacyNoticeVersion: "2026-08-09",
		},
	};
}

describe("feature-enablement.server", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		getNutritionConsentStatement.mockImplementation(
			async (purpose: string) => consent(purpose, "not_granted").statement,
		);
	});

	it("reports macroTracking only when all three purposes are active", async () => {
		getUserSettings.mockResolvedValue({
			aiConsentAt: "2026-01-01T00:00:00.000Z",
		});
		getCopilotAutoDeductConsent.mockResolvedValue(true);
		getNutritionConsentStatus
			.mockResolvedValueOnce(consent("goals", "active"))
			.mockResolvedValueOnce(consent("intake", "active"))
			.mockResolvedValueOnce(consent("agent_processing", "not_granted"));

		const { getFeatureEnablementStatus } = await import(
			"~/lib/feature-enablement.server"
		);
		const status = await getFeatureEnablementStatus(env, identity);
		expect(status.aiFeatures).toBe(true);
		expect(status.macroTracking).toBe(false);
	});

	it("enables AI Features by setting aiConsentAt and auto-deduct", async () => {
		getUserSettings
			.mockResolvedValueOnce({})
			.mockResolvedValue({ aiConsentAt: "2026-01-01T00:00:00.000Z" });
		getCopilotAutoDeductConsent.mockResolvedValue(false);
		getNutritionConsentStatus.mockResolvedValue(
			consent("goals", "not_granted"),
		);

		const { enableFeature } = await import("~/lib/feature-enablement.server");
		await enableFeature(env, identity, "ai", meta);

		expect(patchUserSettings).toHaveBeenCalledWith(
			env.DB,
			"user_1",
			expect.objectContaining({ aiConsentAt: expect.any(String) }),
		);
		expect(setCopilotAutoDeductConsent).toHaveBeenCalledWith(
			env,
			identity,
			true,
		);
	});

	it("set with features on without affirmation throws", async () => {
		getUserSettings.mockResolvedValue({});
		getCopilotAutoDeductConsent.mockResolvedValue(false);
		getNutritionConsentStatus.mockResolvedValue(
			consent("goals", "not_granted"),
		);

		const { setFeatureEnablement, FeatureEnablementAffirmationError } =
			await import("~/lib/feature-enablement.server");

		await expect(
			setFeatureEnablement(
				env,
				identity,
				{ aiFeatures: true, macroTracking: false },
				meta,
			),
		).rejects.toBeInstanceOf(FeatureEnablementAffirmationError);
	});

	it("enabling macro grants all three nutrition purposes", async () => {
		getUserSettings.mockResolvedValue({});
		getCopilotAutoDeductConsent.mockResolvedValue(false);
		getNutritionConsentStatus.mockImplementation(async (_db, _user, purpose) =>
			consent(String(purpose), "active"),
		);
		grantNutritionConsent.mockResolvedValue({});

		const { enableFeature } = await import("~/lib/feature-enablement.server");
		await enableFeature(env, identity, "macro", meta);

		expect(grantNutritionConsent).toHaveBeenCalledTimes(3);
		const purposes = grantNutritionConsent.mock.calls.map(
			(call) => (call[1] as { purpose: string }).purpose,
		);
		expect(purposes.sort()).toEqual(
			["agent_processing", "goals", "intake"].sort(),
		);
	});
});
