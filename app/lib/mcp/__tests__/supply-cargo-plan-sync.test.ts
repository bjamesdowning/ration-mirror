import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockEnv } from "~/test/helpers/mock-env";

vi.mock("~/lib/feature-flags/flags.server", () => ({
	isFeatureEnabled: vi.fn(),
}));

vi.mock("~/lib/supply.server", () => ({
	createSupplyListFromSelectedMeals: vi.fn(),
	completeSupplyList: vi.fn(),
	ensureSupplyList: vi.fn(),
	getSupplyListById: vi.fn(),
}));

vi.mock("~/lib/auth.server", () => ({
	getUserSettings: vi.fn(async () => null),
}));

vi.mock("~/lib/manifest.server", () => ({
	ensureMealPlan: vi.fn(async () => ({ id: "plan-1" })),
}));

vi.mock("~/lib/manifest-bulk-submit.server", () => ({
	insertManifestBulkEntries: vi.fn(async () => ({ entries: [] })),
	ManifestBulkSubmissionError: class ManifestBulkSubmissionError extends Error {},
}));

vi.mock("~/lib/meal-selection.server", () => ({
	clearMealSelections: vi.fn(),
	upsertMealSelection: vi.fn(),
	validateMealOwnership: vi.fn(async () => true),
}));

const mealId = "11111111-1111-4111-8111-111111111111";
const toolEnv = createMockEnv() as never;

const ctx = {
	organizationId: "org-1",
	userId: "user-1",
	scopes: ["mcp:manifest:write", "mcp:galley:write", "mcp:supply:write"],
	agentSurface: "mcp" as const,
};

function planFuelFlags(enabled: boolean) {
	return async (_env: unknown, flag: string) =>
		enabled &&
		(flag === "nutrition-fast-log" ||
			flag === "nutrition-fuel-page" ||
			flag === "plan-fuel-actions");
}

describe("MCP supply sync cargo plan lines", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("omits cargo plan lines on manifest sync when the flag is off", async () => {
		const { isFeatureEnabled } = await import(
			"~/lib/feature-flags/flags.server"
		);
		vi.mocked(isFeatureEnabled).mockImplementation(planFuelFlags(false));
		const { createSupplyListFromSelectedMeals } = await import(
			"~/lib/supply.server"
		);
		const { createManifestToolDefs } = await import("../tools/manifest");
		const commit = createManifestToolDefs(toolEnv).find(
			(tool) => tool.name === "commit_manifest_plan",
		);
		if (!commit) throw new Error("expected commit_manifest_plan");
		const envelope = await commit.handler(ctx as never, {
			confirm: true,
			syncSupply: true,
			entries: [
				{
					mealId,
					date: "2026-11-12",
					slotType: "dinner",
				},
			],
		});
		expect(envelope.ok).toBe(true);
		expect(createSupplyListFromSelectedMeals).toHaveBeenCalledWith(
			expect.anything(),
			"org-1",
			undefined,
			expect.objectContaining({ trigger: "mcp_sync_supply" }),
			"metric",
			"user-1",
			false,
		);
	});

	it("includes cargo plan lines on manifest sync when the flag is on", async () => {
		const { isFeatureEnabled } = await import(
			"~/lib/feature-flags/flags.server"
		);
		vi.mocked(isFeatureEnabled).mockImplementation(planFuelFlags(true));
		const { createSupplyListFromSelectedMeals } = await import(
			"~/lib/supply.server"
		);
		const { createManifestToolDefs } = await import("../tools/manifest");
		const commit = createManifestToolDefs(toolEnv).find(
			(tool) => tool.name === "commit_manifest_plan",
		);
		if (!commit) throw new Error("expected commit_manifest_plan");
		await commit.handler(ctx as never, {
			confirm: true,
			syncSupply: true,
			entries: [
				{
					mealId,
					date: "2026-11-12",
					slotType: "dinner",
				},
			],
		});
		expect(createSupplyListFromSelectedMeals).toHaveBeenCalledWith(
			expect.anything(),
			"org-1",
			undefined,
			expect.objectContaining({ trigger: "mcp_sync_supply" }),
			"metric",
			"user-1",
			true,
		);
	});

	it("omits cargo plan lines on galley sync when the flag is off", async () => {
		const { isFeatureEnabled } = await import(
			"~/lib/feature-flags/flags.server"
		);
		vi.mocked(isFeatureEnabled).mockImplementation(planFuelFlags(false));
		const { createSupplyListFromSelectedMeals } = await import(
			"~/lib/supply.server"
		);
		const { createGalleyToolDefs } = await import("../tools/galley");
		const setActive = createGalleyToolDefs(toolEnv).find(
			(tool) => tool.name === "set_active_meals",
		);
		if (!setActive) throw new Error("expected set_active_meals");
		const envelope = await setActive.handler(ctx as never, {
			mealIds: [mealId],
			syncSupply: true,
		});
		expect(envelope.ok).toBe(true);
		expect(createSupplyListFromSelectedMeals).toHaveBeenCalledWith(
			expect.anything(),
			"org-1",
			undefined,
			expect.objectContaining({ trigger: "mcp_sync_supply" }),
			"metric",
			"user-1",
			false,
		);
	});

	it("includes cargo plan lines on galley sync when the flag is on", async () => {
		const { isFeatureEnabled } = await import(
			"~/lib/feature-flags/flags.server"
		);
		vi.mocked(isFeatureEnabled).mockImplementation(planFuelFlags(true));
		const { createSupplyListFromSelectedMeals } = await import(
			"~/lib/supply.server"
		);
		const { createGalleyToolDefs } = await import("../tools/galley");
		const setActive = createGalleyToolDefs(toolEnv).find(
			(tool) => tool.name === "set_active_meals",
		);
		if (!setActive) throw new Error("expected set_active_meals");
		await setActive.handler(ctx as never, {
			mealIds: [mealId],
			syncSupply: true,
		});
		expect(createSupplyListFromSelectedMeals).toHaveBeenCalledWith(
			expect.anything(),
			"org-1",
			undefined,
			expect.objectContaining({ trigger: "mcp_sync_supply" }),
			"metric",
			"user-1",
			true,
		);
	});

	it("passes the agent flag context into an MCP dock rebuild", async () => {
		const { completeSupplyList, ensureSupplyList } = await import(
			"~/lib/supply.server"
		);
		vi.mocked(ensureSupplyList).mockResolvedValue({ id: "list-1" } as never);
		vi.mocked(completeSupplyList).mockResolvedValue({ docked: 0 } as never);
		const { createSupplyToolDefs } = await import("../tools/supply");
		const complete = createSupplyToolDefs(toolEnv).find(
			(tool) => tool.name === "complete_supply_list",
		);
		if (!complete) throw new Error("expected complete_supply_list");
		const envelope = await complete.handler(ctx as never, { confirm: true });
		expect(envelope.ok).toBe(true);
		expect(completeSupplyList).toHaveBeenCalledWith(
			expect.anything(),
			"org-1",
			"list-1",
			expect.objectContaining({
				userId: "user-1",
				flagContext: expect.objectContaining({
					clientPlatform: "mcp",
					userId: "user-1",
				}),
			}),
		);
	});
});
