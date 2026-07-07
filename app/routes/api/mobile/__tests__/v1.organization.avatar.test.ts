import { beforeEach, describe, expect, it, vi } from "vitest";

const requireMobileActiveGroup = vi.fn();
const checkRateLimit = vi.fn();
const findFirstMember = vi.fn();
const dbUpdateSet = vi.fn();
const storagePut = vi.fn();
const storageList = vi.fn();
const storageDelete = vi.fn();

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

vi.mock("drizzle-orm/d1", () => ({
	drizzle: () => ({
		query: {
			member: { findFirst: (...a: unknown[]) => findFirstMember(...a) },
		},
		update: () => ({
			set: (values: unknown) => ({
				where: () => dbUpdateSet(values),
			}),
		}),
	}),
}));

function makeContext() {
	return {
		cloudflare: {
			env: {
				DB: {},
				RATION_KV: {},
				STORAGE: {
					list: storageList,
					delete: storageDelete,
					put: storagePut,
				},
			},
		},
	} as never;
}

function logoRequest(file: File | null) {
	const form = new FormData();
	if (file) form.append("avatar", file);
	return new Request(
		"https://ration.mayutic.com/api/mobile/v1/organization/avatar",
		{ method: "POST", body: form },
	);
}

function imageFile(sizeBytes: number, type = "image/png") {
	return new File([new Uint8Array(sizeBytes)], "logo.png", { type });
}

describe("POST /api/mobile/v1/organization/avatar", () => {
	beforeEach(() => {
		for (const m of [
			requireMobileActiveGroup,
			checkRateLimit,
			findFirstMember,
			dbUpdateSet,
			storagePut,
			storageList,
			storageDelete,
		]) {
			m.mockReset();
		}
		requireMobileActiveGroup.mockResolvedValue({
			userId: "user_1",
			organizationId: "org_1",
		});
		checkRateLimit.mockResolvedValue({ allowed: true });
		findFirstMember.mockResolvedValue({ role: "admin" });
		storageList.mockResolvedValue({ objects: [], truncated: false });
		storagePut.mockResolvedValue(undefined);
		dbUpdateSet.mockResolvedValue(undefined);
	});

	it("stores the logo for an admin and updates the org logo URL", async () => {
		const { action } = await import(
			"~/routes/api/mobile/v1.organization.avatar"
		);
		const result = (await action({
			request: logoRequest(imageFile(100 * 1024)),
			context: makeContext(),
			params: {},
		} as never)) as { success: boolean; logoUrl: string };

		expect(result.success).toBe(true);
		expect(result.logoUrl).toContain("/api/organization/avatar/org_1");
		expect(storagePut).toHaveBeenCalledWith(
			"organizations/org_1/logo",
			expect.any(ArrayBuffer),
			{ httpMetadata: { contentType: "image/png" } },
		);
		expect(dbUpdateSet).toHaveBeenCalledWith(
			expect.objectContaining({
				logo: expect.stringContaining("/api/organization/avatar/org_1"),
			}),
		);
	});

	it("rejects members without owner/admin role with 403", async () => {
		findFirstMember.mockResolvedValue({ role: "member" });
		const { action } = await import(
			"~/routes/api/mobile/v1.organization.avatar"
		);
		await expect(
			action({
				request: logoRequest(imageFile(100 * 1024)),
				context: makeContext(),
				params: {},
			} as never),
		).rejects.toMatchObject({ init: { status: 403 } });
		expect(storagePut).not.toHaveBeenCalled();
	});

	it("rejects when membership is missing with 403", async () => {
		findFirstMember.mockResolvedValue(undefined);
		const { action } = await import(
			"~/routes/api/mobile/v1.organization.avatar"
		);
		await expect(
			action({
				request: logoRequest(imageFile(100 * 1024)),
				context: makeContext(),
				params: {},
			} as never),
		).rejects.toMatchObject({ init: { status: 403 } });
	});

	it("rejects when rate limited with 429", async () => {
		checkRateLimit.mockResolvedValue({ allowed: false });
		const { action } = await import(
			"~/routes/api/mobile/v1.organization.avatar"
		);
		await expect(
			action({
				request: logoRequest(imageFile(100 * 1024)),
				context: makeContext(),
				params: {},
			} as never),
		).rejects.toMatchObject({ init: { status: 429 } });
	});

	it("rejects unsupported formats with 415", async () => {
		const { action } = await import(
			"~/routes/api/mobile/v1.organization.avatar"
		);
		await expect(
			action({
				request: logoRequest(imageFile(100 * 1024, "image/gif")),
				context: makeContext(),
				params: {},
			} as never),
		).rejects.toMatchObject({ init: { status: 415 } });
		expect(storagePut).not.toHaveBeenCalled();
	});
});
