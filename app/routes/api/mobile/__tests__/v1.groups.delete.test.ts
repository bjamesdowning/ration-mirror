import { beforeEach, describe, expect, it, vi } from "vitest";

const requireMobileActiveGroup = vi.fn();
const checkRateLimit = vi.fn();
const findFirstMember = vi.fn();
const findFirstOrg = vi.fn();
const dbBatch = vi.fn();
const deleteCargoVectors = vi.fn();
const cargoSelect = vi.fn();

vi.mock("~/lib/mobile/auth.server", () => ({
	requireMobileActiveGroup: (...args: unknown[]) =>
		requireMobileActiveGroup(...args),
}));

vi.mock("~/lib/rate-limiter.server", () => ({
	checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}));

vi.mock("~/lib/vector.server", () => ({
	deleteCargoVectors: (...args: unknown[]) => deleteCargoVectors(...args),
}));

vi.mock("drizzle-orm/d1", () => ({
	drizzle: () => ({
		query: {
			member: { findFirst: (...a: unknown[]) => findFirstMember(...a) },
			organization: { findFirst: (...a: unknown[]) => findFirstOrg(...a) },
		},
		select: () => ({
			from: () => ({
				where: (...a: unknown[]) => cargoSelect(...a),
			}),
		}),
		batch: (...a: unknown[]) => dbBatch(...a),
		update: () => ({
			set: () => ({ where: () => ({}) }),
		}),
		delete: () => ({ where: () => ({}) }),
	}),
}));

const env = { DB: {}, RATION_KV: {} };
const ctx = { cloudflare: { env } } as never;
const orgId = "11111111-1111-4111-8111-111111111111";

function deleteRequest(
	body: Record<string, unknown> = { organizationId: orgId },
) {
	return new Request("https://ration.mayutic.com/api/mobile/v1/groups/delete", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}

describe("POST /api/mobile/v1/groups/delete", () => {
	beforeEach(() => {
		for (const m of [
			requireMobileActiveGroup,
			checkRateLimit,
			findFirstMember,
			findFirstOrg,
			dbBatch,
			deleteCargoVectors,
			cargoSelect,
		]) {
			m.mockReset();
		}
		requireMobileActiveGroup.mockResolvedValue({ userId: "user_1" });
		checkRateLimit.mockResolvedValue({ allowed: true });
		findFirstMember.mockResolvedValue({ role: "owner" });
		findFirstOrg.mockResolvedValue({ slug: "home-kitchen" });
		cargoSelect.mockResolvedValue([]);
		deleteCargoVectors.mockResolvedValue(undefined);
		dbBatch.mockResolvedValue(undefined);
	});

	it("deletes a group when the caller is owner", async () => {
		const { action } = await import("~/routes/api/mobile/v1.groups.delete");
		const result = (await action({
			request: deleteRequest(),
			context: ctx,
			params: {},
		} as never)) as { success: boolean };

		expect(result.success).toBe(true);
		expect(requireMobileActiveGroup).toHaveBeenCalled();
		expect(findFirstMember).toHaveBeenCalled();
		expect(dbBatch).toHaveBeenCalled();
	});

	it("rejects non-owners with 403", async () => {
		findFirstMember.mockResolvedValue({ role: "admin" });
		const { action } = await import("~/routes/api/mobile/v1.groups.delete");
		await expect(
			action({
				request: deleteRequest(),
				context: ctx,
				params: {},
			} as never),
		).rejects.toMatchObject({ init: { status: 403 } });
		expect(dbBatch).not.toHaveBeenCalled();
	});

	it("rejects when rate limited with 429", async () => {
		checkRateLimit.mockResolvedValue({ allowed: false });
		const { action } = await import("~/routes/api/mobile/v1.groups.delete");
		await expect(
			action({
				request: deleteRequest(),
				context: ctx,
				params: {},
			} as never),
		).rejects.toMatchObject({ init: { status: 429 } });
		expect(dbBatch).not.toHaveBeenCalled();
	});
});
