import { beforeEach, describe, expect, it, vi } from "vitest";

const requireMobileActiveGroup = vi.fn();
const checkRateLimit = vi.fn();
const ensureMealPlan = vi.fn();
const consumeManifestEntries = vi.fn();
const storeUndoToken = vi.fn();

vi.mock("~/lib/mobile/auth.server", () => ({
	requireMobileActiveGroup: (...args: unknown[]) =>
		requireMobileActiveGroup(...args),
}));

vi.mock("~/lib/rate-limiter.server", () => ({
	checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}));

vi.mock("~/lib/manifest.server", () => ({
	ensureMealPlan: (...args: unknown[]) => ensureMealPlan(...args),
	consumeManifestEntries: (...args: unknown[]) =>
		consumeManifestEntries(...args),
}));

vi.mock("~/lib/undo-token.server", () => ({
	storeUndoToken: (...args: unknown[]) => storeUndoToken(...args),
}));

const ctx = { cloudflare: { env: { DB: {}, RATION_KV: {} } } } as never;

const entryId = "11111111-1111-4111-8111-111111111111";

function postRequest(body: { entryIds: string[] } = { entryIds: [entryId] }) {
	return new Request(
		"https://ration.mayutic.com/api/mobile/v1/manifest/consume",
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		},
	);
}

describe("POST /api/mobile/v1/manifest/consume", () => {
	beforeEach(() => {
		for (const m of [
			requireMobileActiveGroup,
			checkRateLimit,
			ensureMealPlan,
			consumeManifestEntries,
			storeUndoToken,
		]) {
			m.mockReset();
		}
		requireMobileActiveGroup.mockResolvedValue({
			userId: "user_1",
			organizationId: "org_1",
		});
		checkRateLimit.mockResolvedValue({ allowed: true });
		ensureMealPlan.mockResolvedValue({ id: "plan_1" });
		consumeManifestEntries.mockResolvedValue({
			consumed: 1,
			deductions: [{ cargoId: "cargo_1", quantity: 1 }],
			entryIds: [entryId],
			planId: "plan_1",
		});
		storeUndoToken.mockResolvedValue("undo_tok_1");
	});

	it("returns consumed count and undo token on success", async () => {
		const { action } = await import("~/routes/api/mobile/v1.manifest.consume");
		const result = (await action({
			request: postRequest(),
			context: ctx,
			params: {},
		} as never)) as { consumed: number; undoToken: string };

		expect(result.consumed).toBe(1);
		expect(result.undoToken).toBe("undo_tok_1");
	});

	it("returns 200 with consumed > 0 when undo token storage fails", async () => {
		storeUndoToken.mockRejectedValue(new Error("KV unavailable"));

		const { action } = await import("~/routes/api/mobile/v1.manifest.consume");
		const result = (await action({
			request: postRequest(),
			context: ctx,
			params: {},
		} as never)) as { consumed: number; undoToken?: string };

		expect(result.consumed).toBe(1);
		expect(result.undoToken).toBeUndefined();
	});
});
