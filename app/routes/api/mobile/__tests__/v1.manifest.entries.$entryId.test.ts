import { beforeEach, describe, expect, it, vi } from "vitest";

const requireMobileActiveGroup = vi.fn();
const checkRateLimit = vi.fn();
const ensureMealPlan = vi.fn();
const deleteEntry = vi.fn();

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

vi.mock("~/lib/manifest.server", () => ({
	ensureMealPlan: (...args: unknown[]) => ensureMealPlan(...args),
	deleteEntry: (...args: unknown[]) => deleteEntry(...args),
}));

const env = { DB: {}, RATION_KV: {} };
const ctx = { cloudflare: { env } } as never;
const entryId = "11111111-1111-4111-8111-111111111111";

function deleteRequest() {
	return new Request(
		`https://ration.mayutic.com/api/mobile/v1/manifest/entries/${entryId}`,
		{ method: "DELETE" },
	);
}

describe("DELETE /api/mobile/v1/manifest/entries/:entryId", () => {
	beforeEach(() => {
		for (const m of [
			requireMobileActiveGroup,
			checkRateLimit,
			ensureMealPlan,
			deleteEntry,
		]) {
			m.mockReset();
		}
		requireMobileActiveGroup.mockResolvedValue({
			userId: "user_1",
			organizationId: "org_1",
		});
		checkRateLimit.mockResolvedValue({ allowed: true });
		ensureMealPlan.mockResolvedValue({ id: "plan_1" });
		deleteEntry.mockResolvedValue(true);
	});

	it("returns deleted true on success", async () => {
		const { action } = await import(
			"~/routes/api/mobile/v1.manifest.entries.$entryId"
		);
		const result = (await action({
			request: deleteRequest(),
			context: ctx,
			params: { entryId },
		} as never)) as { deleted: boolean };

		expect(result.deleted).toBe(true);
		expect(deleteEntry).toHaveBeenCalledWith(
			env.DB,
			"org_1",
			"plan_1",
			entryId,
		);
	});
});
