import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
	class NutritionUndoUnavailableError extends Error {
		constructor(
			message = "unavailable",
			readonly fallbackAllowed = false,
		) {
			super(message);
		}
	}
	return {
		NutritionUndoUnavailableError,
		requireMobileActiveGroup: vi.fn(),
		checkRateLimit: vi.fn(),
		undoIntake: vi.fn(),
		loadUndoToken: vi.fn(),
		deleteUndoToken: vi.fn(),
		applyUndoRecord: vi.fn(),
	};
});

vi.mock("~/lib/mobile/auth.server", () => ({
	requireMobileActiveGroup: mocks.requireMobileActiveGroup,
}));

vi.mock("~/lib/rate-limiter.server", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("~/lib/rate-limiter.server")>();
	return { ...actual, checkRateLimit: mocks.checkRateLimit };
});

vi.mock("~/lib/nutrition/service.server", () => ({
	NutritionUndoUnavailableError: mocks.NutritionUndoUnavailableError,
	undoIntake: mocks.undoIntake,
}));

vi.mock("~/lib/undo-token.server", () => ({
	loadUndoToken: mocks.loadUndoToken,
	deleteUndoToken: mocks.deleteUndoToken,
}));

vi.mock("~/lib/cook-reversal.server", () => ({
	applyUndoRecord: mocks.applyUndoRecord,
}));

const ctx = { cloudflare: { env: { DB: {}, RATION_KV: {} } } } as never;
const token = "22222222-2222-4222-8222-222222222222";

function postRequest() {
	return new Request("https://ration.mayutic.com/api/mobile/v1/undo", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"X-Ration-Client": "ios/1.5.11",
		},
		body: JSON.stringify({ token }),
	});
}

describe("POST /api/mobile/v1/undo", () => {
	beforeEach(() => {
		for (const m of [
			mocks.requireMobileActiveGroup,
			mocks.checkRateLimit,
			mocks.undoIntake,
			mocks.loadUndoToken,
			mocks.deleteUndoToken,
			mocks.applyUndoRecord,
		]) {
			m.mockReset();
		}
		mocks.requireMobileActiveGroup.mockResolvedValue({
			userId: "user_1",
			organizationId: "org_1",
		});
		mocks.checkRateLimit.mockResolvedValue({ allowed: true });
		mocks.undoIntake.mockRejectedValue(
			new mocks.NutritionUndoUnavailableError("no operation", true),
		);
	});

	it("reverses a cook/consume KV undo token", async () => {
		const record = { kind: "cook", userId: "user_1", organizationId: "org_1" };
		mocks.loadUndoToken.mockResolvedValue(record);
		const { action } = await import("~/routes/api/mobile/v1.undo");

		const result = await action({
			request: postRequest(),
			context: ctx,
			params: {},
		} as never);

		expect(result).toEqual({ success: true, kind: "cook" });
		expect(mocks.loadUndoToken).toHaveBeenCalledWith(
			{},
			token,
			"user_1",
			"org_1",
		);
		expect(mocks.applyUndoRecord).toHaveBeenCalledWith({}, "org_1", record, {
			kv: {},
		});
		expect(mocks.deleteUndoToken).toHaveBeenCalledWith({}, token);
	});

	it("returns 410 when neither an intake operation nor a KV token exists", async () => {
		mocks.loadUndoToken.mockResolvedValue(null);
		const { action } = await import("~/routes/api/mobile/v1.undo");

		await expect(
			action({
				request: postRequest(),
				context: ctx,
				params: {},
			} as never),
		).rejects.toMatchObject({ init: { status: 410 } });
		expect(mocks.applyUndoRecord).not.toHaveBeenCalled();
	});

	it("does not fall back when the intake undo conflicts", async () => {
		mocks.undoIntake.mockRejectedValue(
			new mocks.NutritionUndoUnavailableError("conflict", false),
		);
		const { action } = await import("~/routes/api/mobile/v1.undo");

		await action({
			request: postRequest(),
			context: ctx,
			params: {},
		} as never).catch(() => undefined);

		expect(mocks.loadUndoToken).not.toHaveBeenCalled();
	});
});
