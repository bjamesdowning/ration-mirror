import { beforeEach, describe, expect, it, vi } from "vitest";
import { createManifestToolDefs } from "../tools/manifest";

vi.mock("~/lib/manifest.server", () => ({
	ensureMealPlan: vi.fn().mockResolvedValue({ id: "plan-1" }),
	consumeManifestEntries: vi.fn(),
	addEntry: vi.fn(),
	updateEntry: vi.fn(),
	deleteEntry: vi.fn(),
	getExpiringCargo: vi.fn(),
}));

vi.mock("~/lib/manifest-cook.server", () => ({
	cookManifestEntries: vi.fn(),
}));

vi.mock("~/lib/feature-flags/flags.server", () => ({
	isFeatureEnabled: vi.fn(),
}));

vi.mock("~/lib/mcp/agent-flag-context", async () => {
	const { APP_VERSION } = await import("~/lib/version");
	return {
		resolveAgentSurface: vi.fn(() => "mcp"),
		resolveAgentFlagContext: vi.fn(
			(_env: unknown, ctx: { userId: string }) => ({
				clientPlatform: "mcp",
				clientVersion: APP_VERSION,
				userId: ctx.userId,
			}),
		),
	};
});

vi.mock("~/lib/cargo.server", () => ({
	getExpiringCargo: vi.fn().mockResolvedValue([]),
}));

vi.mock("~/lib/matching.server", () => ({
	MEAL_MATCH_CANDIDATE_CAP: 50,
	matchMeals: vi.fn().mockResolvedValue([]),
}));

vi.mock("~/lib/manifest-bulk-submit.server", () => ({
	insertManifestBulkEntries: vi.fn(),
	ManifestBulkSubmissionError: class ManifestBulkSubmissionError extends Error {},
}));

vi.mock("~/lib/supply.server", () => ({
	createSupplyListFromSelectedMeals: vi.fn(),
}));

const baseCtx = {
	organizationId: "org-1",
	userId: "user-1",
	scopes: ["mcp:manifest:write", "mcp:inventory:write"],
	preClaim: false,
	authMethod: "oauth" as const,
	apiKeyId: "k1",
	keyName: "test",
	keyPrefix: "t_",
	agentSurface: "mcp" as const,
};

const entryId = "11111111-1111-4111-8111-111111111111";

describe("manifest cook/eat MCP tools", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("registers cook_manifest_entries", () => {
		const defs = createManifestToolDefs({} as never);
		expect(defs.some((d) => d.name === "cook_manifest_entries")).toBe(true);
	});

	it("refuses consume_manifest_entries when cook-log-split is on", async () => {
		const { isFeatureEnabled } = await import(
			"~/lib/feature-flags/flags.server"
		);
		vi.mocked(isFeatureEnabled).mockImplementation(async (_env, flag) => {
			return flag === "nutrition-cook-log-split";
		});
		const { consumeManifestEntries } = await import("~/lib/manifest.server");

		const defs = createManifestToolDefs({} as never);
		const consume = defs.find((d) => d.name === "consume_manifest_entries");
		if (!consume) throw new Error("expected consume_manifest_entries");
		const envelope = await consume.handler(baseCtx, {
			entryIds: [entryId],
		});
		expect(envelope.ok).toBe(false);
		if (envelope.ok) return;
		expect(envelope.error.code).toBe("cook_eat_split_required");
		expect(envelope.error.recoveryHint).toContain("cook_manifest_entries");
		expect(consumeManifestEntries).not.toHaveBeenCalled();
	});

	it("cooks via cookManifestEntries when split is on", async () => {
		const { isFeatureEnabled } = await import(
			"~/lib/feature-flags/flags.server"
		);
		vi.mocked(isFeatureEnabled).mockResolvedValue(true);
		const { cookManifestEntries } = await import("~/lib/manifest-cook.server");
		vi.mocked(cookManifestEntries).mockResolvedValue({
			cooked: 1,
			entryIds: [entryId],
			planId: "plan-1",
			deductions: [],
			eventIds: [],
			alreadyCookedIds: [],
		});

		const defs = createManifestToolDefs({} as never);
		const cook = defs.find((d) => d.name === "cook_manifest_entries");
		if (!cook) throw new Error("expected cook_manifest_entries");
		const envelope = await cook.handler(baseCtx, { entryIds: [entryId] });
		expect(envelope.ok).toBe(true);
		if (!envelope.ok) return;
		expect(envelope.data).toMatchObject({
			cooked: 1,
			entryIds: [entryId],
			offerPersonalLog: true,
		});
		expect(cookManifestEntries).toHaveBeenCalledTimes(1);
	});

	it("returns feature_disabled for cook when split is off", async () => {
		const { isFeatureEnabled } = await import(
			"~/lib/feature-flags/flags.server"
		);
		vi.mocked(isFeatureEnabled).mockResolvedValue(false);
		const defs = createManifestToolDefs({} as never);
		const cook = defs.find((d) => d.name === "cook_manifest_entries");
		if (!cook) throw new Error("expected cook_manifest_entries");
		const envelope = await cook.handler(baseCtx, { entryIds: [entryId] });
		expect(envelope.ok).toBe(false);
		if (envelope.ok) return;
		expect(envelope.error.code).toBe("feature_disabled");
	});
});
