import { beforeEach, describe, expect, it, vi } from "vitest";
import { createNutritionToolDefs } from "../tools/nutrition";

vi.mock("~/lib/nutrition/service.server", () => ({
	getSummary: vi.fn(),
	getHistory: vi.fn(),
	setGoal: vi.fn(),
	clearGoal: vi.fn(),
	logManifestIntakes: vi.fn(),
	clearManifestIntakes: vi.fn(),
}));

vi.mock("~/lib/nutrition/consent.server", () => ({
	assertActiveNutritionConsent: vi.fn().mockResolvedValue({
		id: "consent-1",
		grantedAt: new Date("2026-08-01T00:00:00Z"),
	}),
}));

vi.mock("~/lib/manifest.server", () => ({
	ensureMealPlan: vi.fn().mockResolvedValue({ id: "plan-1" }),
}));

vi.mock("~/lib/feature-flags/flags.server", () => ({
	isFeatureEnabled: vi.fn().mockResolvedValue(false),
}));

vi.mock("~/lib/mcp/agent-flag-context", async () => {
	const { APP_VERSION } = await import("~/lib/version");
	return {
		resolveAgentSurface: vi.fn((ctx: { agentSurface?: string }) =>
			ctx.agentSurface === "copilot" ? "copilot" : "mcp",
		),
		resolveAgentFlagContext: vi.fn(
			(_env: unknown, ctx: { userId: string; agentSurface?: string }) => ({
				clientPlatform: ctx.agentSurface === "copilot" ? "copilot" : "mcp",
				clientVersion: APP_VERSION,
				userId: ctx.userId,
			}),
		),
	};
});

const baseCtx = {
	organizationId: "org-1",
	userId: "user-1",
	scopes: ["mcp:nutrition:read", "mcp:nutrition:write"],
	preClaim: false,
	authMethod: "oauth" as const,
	apiKeyId: "k1",
	keyName: "test",
	keyPrefix: "t_",
	agentSurface: "mcp" as const,
};

describe("createNutritionToolDefs", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("registers nutrition read/write Cook/Eat tools", () => {
		const defs = createNutritionToolDefs({} as never);
		expect(defs.map((d) => d.name).sort()).toEqual([
			"clear_manifest_intake",
			"clear_nutrition_goal",
			"get_nutrition_summary",
			"list_nutrition_intakes",
			"log_manifest_intake",
			"quick_eat_cargo",
			"set_nutrition_goal",
		]);
		expect(
			defs.find((d) => d.name === "get_nutrition_summary")?.scopes,
		).toEqual(["mcp:nutrition:read"]);
		expect(defs.find((d) => d.name === "set_nutrition_goal")?.scopes).toEqual([
			"mcp:nutrition:write",
		]);
		expect(defs.find((d) => d.name === "log_manifest_intake")?.scopes).toEqual([
			"mcp:nutrition:write",
		]);
		expect(
			defs.find((d) => d.name === "log_manifest_intake")?.description,
		).toContain("0.01–100");
		expect(
			defs.find((d) => d.name === "log_manifest_intake")?.description,
		).toContain("amount+unit");
		expect(defs.find((d) => d.name === "quick_eat_cargo")?.scopes).toEqual([
			"mcp:inventory:write",
			"mcp:manifest:write",
			"mcp:nutrition:write",
		]);
	});

	it("returns feature_disabled when flags are off", async () => {
		const defs = createNutritionToolDefs({} as never);
		const summary = defs.find((d) => d.name === "get_nutrition_summary");
		if (!summary) throw new Error("expected get_nutrition_summary");
		const envelope = await summary.handler(baseCtx, {
			from: "2026-08-01",
			to: "2026-08-07",
		});
		expect(envelope.ok).toBe(false);
		if (envelope.ok) return;
		expect(envelope.error.code).toBe("feature_disabled");
		expect(envelope.error.recoveryHint).toBeTruthy();
	});

	it("defaults from/to to today UTC and returns vsGoal", async () => {
		const { isFeatureEnabled } = await import(
			"~/lib/feature-flags/flags.server"
		);
		vi.mocked(isFeatureEnabled).mockResolvedValue(true);
		const { getSummary } = await import("~/lib/nutrition/service.server");
		vi.mocked(getSummary).mockResolvedValue({
			from: "2026-08-13",
			to: "2026-08-13",
			totals: {
				energyKcal: 500,
				proteinG: 20,
				carbsG: 40,
				fatG: 10,
			},
			days: [
				{
					date: "2026-08-13",
					energyKcal: 500,
					proteinG: 20,
					carbsG: 40,
					fatG: 10,
					coverageAvg: 1,
					entryCount: 1,
				},
			],
			goal: {
				dailyEnergyKcal: 2000,
				proteinG: 100,
				carbsG: 250,
				fatG: 70,
				fiberG: null,
				effectiveFrom: "2026-08-01",
				effectiveTo: null,
			},
		});

		const defs = createNutritionToolDefs({} as never);
		const summary = defs.find((d) => d.name === "get_nutrition_summary");
		if (!summary) throw new Error("expected get_nutrition_summary");
		const envelope = await summary.handler(baseCtx, {});
		expect(envelope.ok).toBe(true);
		if (!envelope.ok) return;
		expect(getSummary).toHaveBeenCalledWith(
			expect.anything(),
			expect.anything(),
			expect.anything(),
			expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
			expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
		);
		const data = envelope.data as {
			vsGoal: { energyKcal: { remaining: number } };
		};
		expect(data.vsGoal.energyKcal.remaining).toBe(1500);
	});

	it("returns consent_required when Eat upsert denies consent", async () => {
		const { isFeatureEnabled } = await import(
			"~/lib/feature-flags/flags.server"
		);
		vi.mocked(isFeatureEnabled).mockResolvedValue(true);
		const { logManifestIntakes } = await import(
			"~/lib/nutrition/service.server"
		);
		const consentError = Object.assign(new Error("Consent required"), {
			code: "nutrition_consent_required",
		});
		vi.mocked(logManifestIntakes).mockRejectedValue(consentError);

		const defs = createNutritionToolDefs({} as never);
		const log = defs.find((d) => d.name === "log_manifest_intake");
		if (!log) throw new Error("expected log_manifest_intake");

		// runTool maps errors; call handler and let rejection bubble for unit —
		// handlers rethrow; tool-runtime maps. Invoke via runTool path is heavier;
		// assert handler throws consent error for runtime mapping.
		await expect(
			log.handler(baseCtx, {
				operationKey: "33333333-3333-4333-8333-333333333333",
				portions: [
					{
						entryId: "11111111-1111-4111-8111-111111111111",
						servings: 1,
						idempotencyKey: "22222222-2222-4222-8222-222222222222",
					},
				],
			}),
		).rejects.toBe(consentError);
	});

	it("logs intake portions when consent path succeeds", async () => {
		const { isFeatureEnabled } = await import(
			"~/lib/feature-flags/flags.server"
		);
		vi.mocked(isFeatureEnabled).mockResolvedValue(true);
		const { logManifestIntakes } = await import(
			"~/lib/nutrition/service.server"
		);
		vi.mocked(logManifestIntakes).mockResolvedValue({
			operationId: "33333333-3333-4333-8333-333333333333",
			replayed: false,
			undoExpiresAt: null,
			summaryGeneratedAt: "2026-08-09T12:00:00.000Z",
			items: [
				{
					intake: {
						id: "intake-1",
						entryId: "11111111-1111-4111-8111-111111111111",
					} as never,
					replayed: false,
					replacedIntakeId: null,
				},
			],
			dayTotals: [],
		});

		const defs = createNutritionToolDefs({} as never);
		const log = defs.find((d) => d.name === "log_manifest_intake");
		if (!log) throw new Error("expected log_manifest_intake");
		const envelope = await log.handler(baseCtx, {
			operationKey: "33333333-3333-4333-8333-333333333333",
			portions: [
				{
					entryId: "11111111-1111-4111-8111-111111111111",
					servings: 1,
					idempotencyKey: "22222222-2222-4222-8222-222222222222",
				},
			],
		});
		expect(envelope.ok).toBe(true);
		if (!envelope.ok) return;
		expect(envelope.data).toMatchObject({ logged: 1 });
		expect(logManifestIntakes).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				surface: "mcp",
			}),
			expect.objectContaining({ clientPlatform: "mcp" }),
			expect.objectContaining({
				operationKey: "33333333-3333-4333-8333-333333333333",
			}),
		);
	});

	it("accepts amount+unit portions on log_manifest_intake", async () => {
		const { isFeatureEnabled } = await import(
			"~/lib/feature-flags/flags.server"
		);
		vi.mocked(isFeatureEnabled).mockResolvedValue(true);
		const { logManifestIntakes } = await import(
			"~/lib/nutrition/service.server"
		);
		vi.mocked(logManifestIntakes).mockResolvedValue({
			operationId: "33333333-3333-4333-8333-333333333333",
			replayed: false,
			undoExpiresAt: null,
			summaryGeneratedAt: "2026-08-09T12:00:00.000Z",
			items: [
				{
					intake: { id: "intake-1" } as never,
					replayed: false,
					replacedIntakeId: null,
				},
			],
			dayTotals: [],
		});

		const defs = createNutritionToolDefs({} as never);
		const log = defs.find((d) => d.name === "log_manifest_intake");
		if (!log) throw new Error("expected log_manifest_intake");
		const envelope = await log.handler(baseCtx, {
			operationKey: "33333333-3333-4333-8333-333333333333",
			portions: [
				{
					entryId: "11111111-1111-4111-8111-111111111111",
					amount: 180,
					unit: "g",
					idempotencyKey: "22222222-2222-4222-8222-222222222222",
				},
			],
		});
		expect(envelope.ok).toBe(true);
		expect(logManifestIntakes).toHaveBeenCalledWith(
			expect.anything(),
			expect.anything(),
			expect.anything(),
			expect.objectContaining({
				items: [
					expect.objectContaining({
						amount: 180,
						unit: "g",
					}),
				],
			}),
		);
	});

	it("lists intakes when flags are on", async () => {
		const { isFeatureEnabled } = await import(
			"~/lib/feature-flags/flags.server"
		);
		vi.mocked(isFeatureEnabled).mockResolvedValue(true);
		const { getHistory } = await import("~/lib/nutrition/service.server");
		vi.mocked(getHistory).mockResolvedValue({
			items: [
				{
					id: "intake-1",
					entryId: "11111111-1111-4111-8111-111111111111",
					manifestDate: "2026-08-01",
					slotType: "lunch",
					servings: 1,
					energyKcal: 400,
					proteinG: 20,
					carbsG: 40,
					fatG: 10,
					mealId: null,
					mealName: "Pasta",
					organizationId: "org-1",
					organizationName: "Test Kitchen",
					verified: 1,
					occurredAt: new Date("2026-08-01T12:00:00Z"),
					notes: null,
				},
			],
			nextCursor: null,
		});

		const defs = createNutritionToolDefs({} as never);
		const list = defs.find((d) => d.name === "list_nutrition_intakes");
		if (!list) throw new Error("expected list_nutrition_intakes");
		const envelope = await list.handler(baseCtx, {
			from: "2026-08-01",
			to: "2026-08-07",
		});
		expect(envelope.ok).toBe(true);
		if (!envelope.ok) return;
		expect(envelope.data).toMatchObject({
			items: [expect.objectContaining({ mealName: "Pasta" })],
		});
	});

	it("requires confirm for clear_manifest_intake", async () => {
		const defs = createNutritionToolDefs({} as never);
		const clear = defs.find((d) => d.name === "clear_manifest_intake");
		if (!clear) throw new Error("expected clear_manifest_intake");
		const denied = await clear.handler(baseCtx, {
			entryIds: ["11111111-1111-4111-8111-111111111111"],
			confirm: false,
			operationKey: "33333333-3333-4333-8333-333333333333",
		});
		expect(denied.ok).toBe(false);
		if (denied.ok) return;
		expect(denied.error.code).toBe("invalid_input");
	});

	it("clears intake when confirm is true", async () => {
		const { clearManifestIntakes } = await import(
			"~/lib/nutrition/service.server"
		);
		vi.mocked(clearManifestIntakes).mockResolvedValue({
			operationId: "33333333-3333-4333-8333-333333333333",
			replayed: false,
			undoExpiresAt: null,
			summaryGeneratedAt: "2026-08-09T12:00:00.000Z",
			items: [
				{
					entryId: "11111111-1111-4111-8111-111111111111",
					replayed: false,
					voidedIntakeId: "intake-1",
				},
			],
			dayTotals: [],
		});

		const defs = createNutritionToolDefs({} as never);
		const clear = defs.find((d) => d.name === "clear_manifest_intake");
		if (!clear) throw new Error("expected clear_manifest_intake");
		const envelope = await clear.handler(baseCtx, {
			entryIds: ["11111111-1111-4111-8111-111111111111"],
			confirm: true,
			operationKey: "33333333-3333-4333-8333-333333333333",
		});
		expect(envelope.ok).toBe(true);
		if (!envelope.ok) return;
		expect(envelope.data).toMatchObject({ clearedCount: 1 });
		expect(clearManifestIntakes).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				surface: "mcp",
			}),
			expect.objectContaining({ clientPlatform: "mcp" }),
			expect.objectContaining({
				entryIds: ["11111111-1111-4111-8111-111111111111"],
			}),
		);
	});
});
