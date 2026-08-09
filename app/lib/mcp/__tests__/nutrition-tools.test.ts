import { beforeEach, describe, expect, it, vi } from "vitest";
import { createNutritionToolDefs } from "../tools/nutrition";

vi.mock("~/lib/nutrition/persist.server", () => ({
	getNutritionSummary: vi.fn(),
	listNutritionIntakesForRange: vi.fn(),
	upsertNutritionGoal: vi.fn(),
	clearNutritionGoal: vi.fn(),
}));

vi.mock("~/lib/nutrition/intake-log.server", () => ({
	upsertManifestPersonalIntake: vi.fn(),
	clearManifestPersonalIntake: vi.fn(),
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

	it("returns consent_required when Eat upsert denies consent", async () => {
		const { isFeatureEnabled } = await import(
			"~/lib/feature-flags/flags.server"
		);
		vi.mocked(isFeatureEnabled).mockResolvedValue(true);
		const { upsertManifestPersonalIntake } = await import(
			"~/lib/nutrition/intake-log.server"
		);
		const { NutritionConsentRequiredError } = await import(
			"~/lib/nutrition/consent.server"
		);
		vi.mocked(upsertManifestPersonalIntake).mockRejectedValue(
			new NutritionConsentRequiredError("intake"),
		);

		const defs = createNutritionToolDefs({} as never);
		const log = defs.find((d) => d.name === "log_manifest_intake");
		if (!log) throw new Error("expected log_manifest_intake");

		// runTool maps errors; call handler and let rejection bubble for unit —
		// handlers rethrow; tool-runtime maps. Invoke via runTool path is heavier;
		// assert handler throws consent error for runtime mapping.
		await expect(
			log.handler(baseCtx, {
				portions: [
					{
						entryId: "11111111-1111-4111-8111-111111111111",
						servings: 1,
						idempotencyKey: "22222222-2222-4222-8222-222222222222",
					},
				],
			}),
		).rejects.toBeInstanceOf(NutritionConsentRequiredError);
	});

	it("logs intake portions when consent path succeeds", async () => {
		const { isFeatureEnabled } = await import(
			"~/lib/feature-flags/flags.server"
		);
		vi.mocked(isFeatureEnabled).mockResolvedValue(true);
		const { upsertManifestPersonalIntake } = await import(
			"~/lib/nutrition/intake-log.server"
		);
		vi.mocked(upsertManifestPersonalIntake).mockResolvedValue({
			intake: {
				id: "intake-1",
				entryId: "11111111-1111-4111-8111-111111111111",
				servings: 1,
				energyKcal: 400,
				proteinG: 20,
				carbsG: 40,
				fatG: 10,
				occurredAt: new Date("2026-08-01T12:00:00Z"),
			},
			idempotent: false,
			replaced: false,
			replacedIntakeId: null,
		});

		const defs = createNutritionToolDefs({} as never);
		const log = defs.find((d) => d.name === "log_manifest_intake");
		if (!log) throw new Error("expected log_manifest_intake");
		const envelope = await log.handler(baseCtx, {
			portions: [
				{
					entryId: "11111111-1111-4111-8111-111111111111",
					servings: 1,
					idempotencyKey: "22222222-2222-4222-8222-222222222222",
				},
			],
			consent: true,
		});
		expect(envelope.ok).toBe(true);
		if (!envelope.ok) return;
		expect(envelope.data).toMatchObject({ logged: 1 });
		expect(upsertManifestPersonalIntake).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				consent: true,
				consentSource: "mcp",
				flagContext: expect.objectContaining({ clientPlatform: "mcp" }),
			}),
		);
	});

	it("lists intakes when flags are on", async () => {
		const { isFeatureEnabled } = await import(
			"~/lib/feature-flags/flags.server"
		);
		vi.mocked(isFeatureEnabled).mockResolvedValue(true);
		const { listNutritionIntakesForRange } = await import(
			"~/lib/nutrition/persist.server"
		);
		vi.mocked(listNutritionIntakesForRange).mockResolvedValue({
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
					verified: 1,
					occurredAt: new Date("2026-08-01T12:00:00Z"),
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
		});
		expect(denied.ok).toBe(false);
		if (denied.ok) return;
		expect(denied.error.code).toBe("invalid_input");
	});

	it("clears intake when confirm is true", async () => {
		const { clearManifestPersonalIntake } = await import(
			"~/lib/nutrition/intake-log.server"
		);
		vi.mocked(clearManifestPersonalIntake).mockResolvedValue({
			cleared: true,
			voidedIntakeId: "intake-1",
		});

		const defs = createNutritionToolDefs({} as never);
		const clear = defs.find((d) => d.name === "clear_manifest_intake");
		if (!clear) throw new Error("expected clear_manifest_intake");
		const envelope = await clear.handler(baseCtx, {
			entryIds: ["11111111-1111-4111-8111-111111111111"],
			confirm: true,
		});
		expect(envelope.ok).toBe(true);
		if (!envelope.ok) return;
		expect(envelope.data).toMatchObject({ clearedCount: 1 });
		expect(clearManifestPersonalIntake).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				entryId: "11111111-1111-4111-8111-111111111111",
				flagContext: expect.objectContaining({ clientPlatform: "mcp" }),
			}),
		);
	});
});
