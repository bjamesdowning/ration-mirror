import { beforeEach, describe, expect, it, vi } from "vitest";

const requireMobileAuth = vi.fn();
const checkRateLimit = vi.fn();
const dbUpdateSet = vi.fn();
const storagePut = vi.fn();
const storageList = vi.fn();
const storageDelete = vi.fn();

vi.mock("~/lib/mobile/auth.server", () => ({
	requireMobileAuth: (...args: unknown[]) => requireMobileAuth(...args),
}));

vi.mock("~/lib/rate-limiter.server", () => ({
	checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}));

vi.mock("drizzle-orm/d1", () => ({
	drizzle: () => ({
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

function avatarRequest(file: File | null) {
	const form = new FormData();
	if (file) form.append("avatar", file);
	return new Request("https://ration.mayutic.com/api/mobile/v1/user/avatar", {
		method: "POST",
		body: form,
	});
}

function imageFile(sizeBytes: number, type = "image/jpeg") {
	return new File([new Uint8Array(sizeBytes)], "avatar.jpg", { type });
}

describe("POST /api/mobile/v1/user/avatar", () => {
	beforeEach(() => {
		for (const m of [
			requireMobileAuth,
			checkRateLimit,
			dbUpdateSet,
			storagePut,
			storageList,
			storageDelete,
		]) {
			m.mockReset();
		}
		requireMobileAuth.mockResolvedValue({ userId: "user_1" });
		checkRateLimit.mockResolvedValue({ allowed: true });
		storageList.mockResolvedValue({ objects: [], truncated: false });
		storagePut.mockResolvedValue(undefined);
		dbUpdateSet.mockResolvedValue(undefined);
	});

	it("stores the avatar and updates the user image URL", async () => {
		const { action } = await import("~/routes/api/mobile/v1.user.avatar");
		const result = (await action({
			request: avatarRequest(imageFile(100 * 1024)),
			context: makeContext(),
			params: {},
		} as never)) as { success: boolean; imageUrl: string };

		expect(result.success).toBe(true);
		expect(result.imageUrl).toContain("/api/user/avatar/user_1");
		expect(storagePut).toHaveBeenCalledWith(
			"users/user_1/avatar",
			expect.any(ArrayBuffer),
			{ httpMetadata: { contentType: "image/jpeg" } },
		);
		expect(dbUpdateSet).toHaveBeenCalledWith(
			expect.objectContaining({
				image: expect.stringContaining("/api/user/avatar/user_1"),
			}),
		);
	});

	it("rejects non-POST methods with 405", async () => {
		const { action } = await import("~/routes/api/mobile/v1.user.avatar");
		await expect(
			action({
				request: new Request(
					"https://ration.mayutic.com/api/mobile/v1/user/avatar",
					{ method: "GET" },
				),
				context: makeContext(),
				params: {},
			} as never),
		).rejects.toMatchObject({ init: { status: 405 } });
	});

	it("rejects when rate limited with 429", async () => {
		checkRateLimit.mockResolvedValue({ allowed: false, retryAfter: 30 });
		const { action } = await import("~/routes/api/mobile/v1.user.avatar");
		await expect(
			action({
				request: avatarRequest(imageFile(100 * 1024)),
				context: makeContext(),
				params: {},
			} as never),
		).rejects.toMatchObject({ init: { status: 429 } });
	});

	it("rejects when no file is provided with 400", async () => {
		const { action } = await import("~/routes/api/mobile/v1.user.avatar");
		await expect(
			action({
				request: avatarRequest(null),
				context: makeContext(),
				params: {},
			} as never),
		).rejects.toMatchObject({ init: { status: 400 } });
	});

	it("rejects oversized images with 400", async () => {
		const { action } = await import("~/routes/api/mobile/v1.user.avatar");
		await expect(
			action({
				request: avatarRequest(imageFile(3 * 1024 * 1024)),
				context: makeContext(),
				params: {},
			} as never),
		).rejects.toMatchObject({ init: { status: 400 } });
		expect(storagePut).not.toHaveBeenCalled();
	});

	it("rejects unsupported formats with 415", async () => {
		const { action } = await import("~/routes/api/mobile/v1.user.avatar");
		await expect(
			action({
				request: avatarRequest(imageFile(100 * 1024, "application/pdf")),
				context: makeContext(),
				params: {},
			} as never),
		).rejects.toMatchObject({ init: { status: 415 } });
		expect(storagePut).not.toHaveBeenCalled();
	});
});
