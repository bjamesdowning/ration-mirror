import { beforeEach, describe, expect, it, vi } from "vitest";

const selectLimit = vi.fn();

vi.mock("drizzle-orm/d1", () => ({
	drizzle: vi.fn(() => ({
		select: vi.fn(() => ({
			from: vi.fn().mockReturnThis(),
			where: vi.fn().mockReturnThis(),
			orderBy: vi.fn().mockReturnThis(),
			limit: selectLimit,
		})),
	})),
}));

describe("nutrition consent service", () => {
	beforeEach(() => {
		selectLimit.mockReset();
	});

	it("fails closed when active consent is missing", async () => {
		selectLimit.mockResolvedValueOnce([]);
		const { assertActiveNutritionConsent, NutritionConsentError } =
			await import("../consent.server");
		const error = await assertActiveNutritionConsent(
			{} as D1Database,
			"u1",
			"goals",
		).catch((cause) => cause);
		expect(error).toBeInstanceOf(NutritionConsentError);
		expect(error.code).toBe("nutrition_consent_required");
	});

	it("requires re-consent for active legacy policy rows", async () => {
		selectLimit.mockResolvedValueOnce([
			{
				id: "legacy",
				userId: "u1",
				purpose: "goals",
				policyVersion: "2026-08-01",
				statementVersion: null,
				statementSha256: null,
				privacyNoticeVersion: null,
				grantedAt: new Date("2026-08-01T00:00:00Z"),
				withdrawnAt: null,
			},
		]);
		const { getNutritionConsentStatus } = await import("../consent.server");
		const status = await getNutritionConsentStatus(
			{} as D1Database,
			"u1",
			"goals",
		);
		expect(status.state).toBe("reconsent_required");
		expect(status.consentId).toBeNull();
	});

	it("returns the winning row when concurrent grants race", async () => {
		const { getNutritionConsentStatement } = await import("../consent-policy");
		const statement = await getNutritionConsentStatement("intake");
		const winner = {
			id: "winner",
			user_id: "u1",
			purpose: "intake",
			policy_version: statement.policyVersion,
			source: "web",
			granted_at: 1_786_224_600,
			withdrawn_at: null,
			statement_version: statement.statementVersion,
			statement_sha256: statement.sha256,
			privacy_notice_version: statement.privacyNoticeVersion,
			client_surface: "web_privacy_settings",
			client_version: "1.8.1",
			locale: "en-IE",
			request_id: "11111111-1111-4111-8111-111111111111",
			created_at: 1_786_224_600,
		};
		const first = vi
			.fn()
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce(winner);
		const bind = vi.fn().mockReturnValue({ first });
		const prepare = vi.fn().mockReturnValue({ bind });
		const { grantNutritionConsent } = await import("../consent.server");
		const row = await grantNutritionConsent(
			{ prepare } as unknown as D1Database,
			{
				userId: "u1",
				purpose: "intake",
				source: "web",
				policyVersion: statement.policyVersion,
				statementVersion: statement.statementVersion,
				statementSha256: statement.sha256,
				affirmed: true,
				clientSurface: "web_privacy_settings",
				clientVersion: "1.8.1",
				locale: "en-IE",
				requestId: "11111111-1111-4111-8111-111111111111",
			},
		);
		expect(row.id).toBe("winner");
		expect(prepare).toHaveBeenCalledWith(
			expect.stringContaining("SELECT * FROM nutrition_consent"),
		);
		expect(prepare).toHaveBeenCalledWith(
			expect.stringContaining("ON CONFLICT(user_id, purpose, policy_version)"),
		);
		expect(prepare.mock.calls.join("\n")).not.toMatch(
			/ON CONFLICT[\s\S]*ON CONFLICT/,
		);
		expect(first).toHaveBeenCalledTimes(2);
	});

	it("rejects a stale or altered consent statement", async () => {
		const { grantNutritionConsent, NutritionConsentError } = await import(
			"../consent.server"
		);
		const error = await grantNutritionConsent({} as D1Database, {
			userId: "u1",
			purpose: "goals",
			source: "web",
			policyVersion: "stale",
			statementVersion: "stale",
			statementSha256: "0".repeat(64),
			affirmed: true,
			clientSurface: "web_privacy_settings",
			requestId: "22222222-2222-4222-8222-222222222222",
		}).catch((cause) => cause);
		expect(error).toBeInstanceOf(NutritionConsentError);
		expect(error.code).toBe("nutrition_consent_statement_stale");
		expect(error.status).toBe(409);
	});

	it("erases stable operation results with the selected nutrition dataset", async () => {
		const preparedSql: string[] = [];
		const prepare = vi.fn((query: string) => {
			preparedSql.push(query);
			return {
				bind: vi.fn(() => ({ query })),
			};
		});
		const batch = vi.fn().mockResolvedValue([]);
		const { eraseNutritionData } = await import("../consent.server");

		await eraseNutritionData({ prepare, batch } as unknown as D1Database, {
			userId: "u1",
			dataset: "all",
			requestId: "33333333-3333-4333-8333-333333333333",
		});

		expect(preparedSql).toEqual(
			expect.arrayContaining([
				expect.stringContaining("DELETE FROM nutrition_goal"),
				expect.stringContaining("operation_type IN ('set_goal', 'clear_goal')"),
				expect.stringContaining("DELETE FROM nutrition_intake"),
				expect.stringContaining(
					"operation_type IN ('log_manifest_intakes', 'clear_manifest_intakes')",
				),
			]),
		);
		expect(batch).toHaveBeenCalledOnce();
	});
});
