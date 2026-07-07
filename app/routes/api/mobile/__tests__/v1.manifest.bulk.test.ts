import { beforeEach, describe, expect, it, vi } from "vitest";

const requireMobileActiveGroup = vi.fn();
const checkRateLimit = vi.fn();
const ensureMealPlan = vi.fn();
const submitManifestBulkEntries = vi.fn();

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
}));

vi.mock("~/lib/manifest-bulk-submit.server", () => ({
	submitManifestBulkEntries: (...args: unknown[]) =>
		submitManifestBulkEntries(...args),
}));

const env = { DB: {}, RATION_KV: {} };
const ctx = { cloudflare: { env } } as never;

function postRequest() {
	return new Request("https://ration.mayutic.com/api/mobile/v1/manifest/bulk", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			entries: [
				{
					mealId: "11111111-1111-4111-8111-111111111111",
					date: "2026-07-01",
					slotType: "dinner",
				},
			],
		}),
	});
}

describe("POST /api/mobile/v1/manifest/bulk", () => {
	beforeEach(() => {
		for (const m of [
			requireMobileActiveGroup,
			checkRateLimit,
			ensureMealPlan,
			submitManifestBulkEntries,
		]) {
			m.mockReset();
		}
		requireMobileActiveGroup.mockResolvedValue({
			userId: "user_1",
			organizationId: "org_1",
		});
		checkRateLimit.mockResolvedValue({ allowed: true });
		ensureMealPlan.mockResolvedValue({ id: "plan_1" });
		submitManifestBulkEntries.mockResolvedValue({ inserted: 1 });
	});

	it("returns inserted count on success", async () => {
		const { action } = await import("~/routes/api/mobile/v1.manifest.bulk");
		const result = (await action({
			request: postRequest(),
			context: ctx,
			params: {},
		} as never)) as { inserted: number };

		expect(result.inserted).toBe(1);
		expect(submitManifestBulkEntries).toHaveBeenCalledWith(
			env.DB,
			"org_1",
			"plan_1",
			expect.objectContaining({ entries: expect.any(Array) }),
		);
	});
});
