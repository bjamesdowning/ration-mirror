import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQuickEatToolDefs } from "../tools/quick-eat";

vi.mock("~/lib/cargo-quick-eat.server", () => ({
	quickEatFromCargo: vi.fn(),
	QuickEatValidationError: class QuickEatValidationError extends Error {
		code: string;
		constructor(code: string, message: string) {
			super(message);
			this.name = "QuickEatValidationError";
			this.code = code;
		}
	},
	QuickEatNotFoundError: class QuickEatNotFoundError extends Error {
		code = "cargo_not_found";
		constructor() {
			super("Cargo item not found");
			this.name = "QuickEatNotFoundError";
		}
	},
}));

vi.mock("~/lib/cargo.server", () => ({
	getCargoItem: vi.fn(),
	getCargoByIds: vi.fn(),
	ingestCargoItems: vi.fn(),
}));

vi.mock("~/lib/cargo-index.server", () => ({
	fetchOrgCargoIndex: vi.fn().mockResolvedValue([]),
}));

vi.mock("~/lib/vector.server", async (importOriginal) => {
	const actual = await importOriginal<typeof import("~/lib/vector.server")>();
	return {
		...actual,
		findSimilarCargoBatch: vi.fn().mockResolvedValue(new Map()),
	};
});

vi.mock("~/lib/org-supply-settings.server", () => ({
	kitchenTodayForOrganization: vi.fn(async () => {
		const now = new Date();
		const y = now.getUTCFullYear();
		const m = String(now.getUTCMonth() + 1).padStart(2, "0");
		const d = String(now.getUTCDate()).padStart(2, "0");
		return `${y}-${m}-${d}`;
	}),
}));

vi.mock("~/lib/feature-flags/flags.server", () => ({
	isFeatureEnabled: vi.fn().mockResolvedValue(false),
}));

vi.mock("~/lib/plan-fuel-actions.server", () => ({
	addCargoToFuel: vi.fn(),
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

const OP_KEY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CARGO_ID = "11111111-1111-4111-8111-111111111111";

const baseCtx = {
	organizationId: "org-1",
	userId: "user-1",
	scopes: ["mcp:inventory:write", "mcp:manifest:write", "mcp:nutrition:write"],
	preClaim: false,
	authMethod: "oauth" as const,
	apiKeyId: "k1",
	keyName: "test",
	keyPrefix: "t_",
	agentSurface: "mcp" as const,
};

const eatResult = {
	cargo: { id: CARGO_ID, name: "grapes", quantity: 0, unit: "unit" },
	provision: { id: "p1", alreadyExisted: false, normalized: true },
	entry: {
		id: "e1",
		planId: "plan-1",
		date: "2026-08-13",
		slotType: "snack",
		cookedAt: "2026-08-13T12:00:00.000Z",
	},
	cookServings: 1,
	requestedQuantity: 1,
	deductedQuantity: 1,
	stockWasShort: true,
	intakeLogged: true,
	intakeSkipReason: null,
	intakeServings: 1,
};

const FUEL_FLAGS = new Set([
	"plan-fuel-actions",
	"nutrition-fuel-page",
	"nutrition-fast-log",
]);

async function mockFlags(planFuelActions: boolean) {
	const { isFeatureEnabled } = await import("~/lib/feature-flags/flags.server");
	vi.mocked(isFeatureEnabled).mockImplementation(async (_env, flag) => {
		if (FUEL_FLAGS.has(flag)) return planFuelActions;
		return true;
	});
}

describe("quick_eat_cargo", () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		const { isFeatureEnabled } = await import(
			"~/lib/feature-flags/flags.server"
		);
		vi.mocked(isFeatureEnabled).mockResolvedValue(false);
	});

	it("requires inventory, manifest, and nutrition write scopes", () => {
		const defs = createQuickEatToolDefs({} as never);
		expect(defs[0]?.name).toBe("quick_eat_cargo");
		expect(defs[0]?.scopes).toEqual([
			"mcp:inventory:write",
			"mcp:manifest:write",
			"mcp:nutrition:write",
		]);
	});

	it("returns feature_disabled when flags are off", async () => {
		const defs = createQuickEatToolDefs({} as never);
		const tool = defs[0];
		if (!tool) throw new Error("expected quick_eat_cargo");
		const envelope = await tool.handler(baseCtx, {
			name: "grapes",
			quantity: 1,
			operationKey: OP_KEY,
		});
		expect(envelope.ok).toBe(false);
		if (envelope.ok) return;
		expect(envelope.error.code).toBe("feature_disabled");
	});

	it("eats an existing cargoId", async () => {
		await mockFlags(false);
		const { getCargoItem } = await import("~/lib/cargo.server");
		vi.mocked(getCargoItem).mockResolvedValue({
			id: CARGO_ID,
			name: "grapes",
			quantity: 2,
			unit: "unit",
		} as never);
		const { quickEatFromCargo } = await import("~/lib/cargo-quick-eat.server");
		vi.mocked(quickEatFromCargo).mockResolvedValue(eatResult);

		const defs = createQuickEatToolDefs({} as never);
		const tool = defs[0];
		if (!tool) throw new Error("expected quick_eat_cargo");
		const envelope = await tool.handler(baseCtx, {
			cargoId: CARGO_ID,
			quantity: 1,
			operationKey: OP_KEY,
		});
		expect(envelope.ok).toBe(true);
		if (!envelope.ok) return;
		expect(envelope.data).toMatchObject({
			eaten: true,
			created: false,
			stockWasShort: true,
		});
		expect(quickEatFromCargo).toHaveBeenCalledWith(
			expect.anything(),
			"org-1",
			expect.objectContaining({ surface: "mcp" }),
			expect.anything(),
			expect.objectContaining({
				cargoId: CARGO_ID,
				quantity: 1,
				operationKey: OP_KEY,
				source: "mcp",
			}),
		);
		const { addCargoToFuel } = await import("~/lib/plan-fuel-actions.server");
		expect(addCargoToFuel).not.toHaveBeenCalled();
	});

	it("logs Fuel and does not insert a snack when plan-fuel-actions is on", async () => {
		await mockFlags(true);
		const { getCargoItem } = await import("~/lib/cargo.server");
		vi.mocked(getCargoItem).mockResolvedValue({
			id: CARGO_ID,
			name: "grapes",
			quantity: 2,
			unit: "unit",
		} as never);
		const { addCargoToFuel } = await import("~/lib/plan-fuel-actions.server");
		vi.mocked(addCargoToFuel).mockResolvedValue({
			intakeId: "intake-1",
			deducted: 1,
		});
		const { quickEatFromCargo } = await import("~/lib/cargo-quick-eat.server");

		const defs = createQuickEatToolDefs({} as never);
		const tool = defs[0];
		if (!tool) throw new Error("expected quick_eat_cargo");
		const envelope = await tool.handler(baseCtx, {
			cargoId: CARGO_ID,
			quantity: 1,
			operationKey: OP_KEY,
		});
		expect(envelope.ok).toBe(true);
		if (!envelope.ok) return;
		expect(envelope.data).toMatchObject({
			eaten: true,
			created: false,
			intakeId: "intake-1",
			deducted: 1,
		});
		expect(envelope.data).not.toHaveProperty("entry");
		expect(envelope.data).not.toHaveProperty("provision");
		expect(quickEatFromCargo).not.toHaveBeenCalled();
		expect(addCargoToFuel).toHaveBeenCalledWith(
			expect.anything(),
			"org-1",
			CARGO_ID,
			1,
			expect.objectContaining({ surface: "mcp" }),
			expect.anything(),
			expect.objectContaining({
				operationKey: OP_KEY,
				idempotencyKey: OP_KEY,
			}),
		);
	});

	it("creates a missing name then Quick Eats (net-zero restock line)", async () => {
		await mockFlags(false);
		const { fetchOrgCargoIndex } = await import("~/lib/cargo-index.server");
		vi.mocked(fetchOrgCargoIndex).mockResolvedValue([]);
		const { findSimilarCargoBatch } = await import("~/lib/vector.server");
		vi.mocked(findSimilarCargoBatch).mockResolvedValue(new Map());
		const { ingestCargoItems, getCargoItem } = await import(
			"~/lib/cargo.server"
		);
		vi.mocked(ingestCargoItems).mockResolvedValue([
			{
				status: "created",
				item: { id: CARGO_ID, name: "grapes", quantity: 1, unit: "unit" },
			},
		] as never);
		vi.mocked(getCargoItem).mockResolvedValue({
			id: CARGO_ID,
			name: "grapes",
			quantity: 1,
			unit: "unit",
		} as never);
		const { quickEatFromCargo } = await import("~/lib/cargo-quick-eat.server");
		vi.mocked(quickEatFromCargo).mockResolvedValue(eatResult);

		const defs = createQuickEatToolDefs({} as never);
		const tool = defs[0];
		if (!tool) throw new Error("expected quick_eat_cargo");
		const envelope = await tool.handler(baseCtx, {
			name: "grapes",
			quantity: 1,
			operationKey: OP_KEY,
		});
		expect(envelope.ok).toBe(true);
		if (!envelope.ok) return;
		expect(envelope.data).toMatchObject({ eaten: true, created: true });
		expect(ingestCargoItems).toHaveBeenCalledWith(
			expect.anything(),
			"org-1",
			[
				expect.objectContaining({
					name: "grapes",
					quantity: 1,
					domain: "food",
				}),
			],
			expect.objectContaining({ skipVectorPhase: true }),
		);
		expect(quickEatFromCargo).toHaveBeenCalledTimes(1);
	});

	it("returns candidates without writing when the name is ambiguous", async () => {
		await mockFlags(false);
		const { fetchOrgCargoIndex } = await import("~/lib/cargo-index.server");
		vi.mocked(fetchOrgCargoIndex).mockResolvedValue([
			{
				id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
				name: "Grapes",
				domain: "food",
				quantity: 1,
				unit: "unit",
			},
			{
				id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
				name: "grapes",
				domain: "food",
				quantity: 2,
				unit: "bunch",
			},
		]);
		const { ingestCargoItems } = await import("~/lib/cargo.server");
		const { quickEatFromCargo } = await import("~/lib/cargo-quick-eat.server");

		const defs = createQuickEatToolDefs({} as never);
		const tool = defs[0];
		if (!tool) throw new Error("expected quick_eat_cargo");
		const envelope = await tool.handler(baseCtx, {
			name: "grapes",
			quantity: 1,
			operationKey: OP_KEY,
		});
		expect(envelope.ok).toBe(true);
		if (!envelope.ok) return;
		expect(envelope.data).toMatchObject({
			eaten: false,
			requiresDisambiguation: true,
		});
		expect(ingestCargoItems).not.toHaveBeenCalled();
		expect(quickEatFromCargo).not.toHaveBeenCalled();
	});

	it("does not eat or create when the only semantic hit is below 0.78", async () => {
		await mockFlags(false);
		const { fetchOrgCargoIndex } = await import("~/lib/cargo-index.server");
		vi.mocked(fetchOrgCargoIndex).mockResolvedValue([]);
		const { findSimilarCargoBatch } = await import("~/lib/vector.server");
		vi.mocked(findSimilarCargoBatch).mockResolvedValue(
			new Map([
				[
					"grapes",
					[{ itemId: CARGO_ID, score: 0.62, itemName: "grape juice" }],
				],
			]),
		);
		const { getCargoByIds, ingestCargoItems } = await import(
			"~/lib/cargo.server"
		);
		vi.mocked(getCargoByIds).mockResolvedValue([
			{
				id: CARGO_ID,
				name: "grape juice",
				quantity: 1,
				unit: "l",
			},
		] as never);
		const { quickEatFromCargo } = await import("~/lib/cargo-quick-eat.server");

		const defs = createQuickEatToolDefs({} as never);
		const tool = defs[0];
		if (!tool) throw new Error("expected quick_eat_cargo");
		const envelope = await tool.handler(baseCtx, {
			name: "grapes",
			quantity: 1,
			operationKey: OP_KEY,
		});
		expect(envelope.ok).toBe(true);
		if (!envelope.ok) return;
		expect(envelope.data).toMatchObject({
			eaten: false,
			requiresDisambiguation: true,
			note: expect.stringContaining("Nothing was changed"),
			candidates: [expect.objectContaining({ id: CARGO_ID, matchScore: 0.62 })],
		});
		expect(ingestCargoItems).not.toHaveBeenCalled();
		expect(quickEatFromCargo).not.toHaveBeenCalled();
		expect(findSimilarCargoBatch).toHaveBeenCalledWith(
			expect.anything(),
			"org-1",
			["grapes"],
			{ topK: 3, threshold: 0.6 },
		);
	});

	it("eats a lone semantic hit at the cook threshold", async () => {
		await mockFlags(false);
		const { fetchOrgCargoIndex } = await import("~/lib/cargo-index.server");
		vi.mocked(fetchOrgCargoIndex).mockResolvedValue([]);
		const { findSimilarCargoBatch } = await import("~/lib/vector.server");
		vi.mocked(findSimilarCargoBatch).mockResolvedValue(
			new Map([
				["grapes", [{ itemId: CARGO_ID, score: 0.78, itemName: "grapes" }]],
			]),
		);
		const { getCargoItem, ingestCargoItems } = await import(
			"~/lib/cargo.server"
		);
		vi.mocked(getCargoItem).mockResolvedValue({
			id: CARGO_ID,
			name: "grapes",
			quantity: 2,
			unit: "unit",
		} as never);
		const { quickEatFromCargo } = await import("~/lib/cargo-quick-eat.server");
		vi.mocked(quickEatFromCargo).mockResolvedValue(eatResult);

		const defs = createQuickEatToolDefs({} as never);
		const tool = defs[0];
		if (!tool) throw new Error("expected quick_eat_cargo");
		const envelope = await tool.handler(baseCtx, {
			name: "grapes",
			quantity: 1,
			operationKey: OP_KEY,
		});
		expect(envelope.ok).toBe(true);
		if (!envelope.ok) return;
		expect(envelope.data).toMatchObject({
			eaten: true,
			created: false,
		});
		expect(ingestCargoItems).not.toHaveBeenCalled();
		expect(quickEatFromCargo).toHaveBeenCalledWith(
			expect.anything(),
			"org-1",
			expect.anything(),
			expect.anything(),
			expect.objectContaining({ cargoId: CARGO_ID }),
		);
	});
});
