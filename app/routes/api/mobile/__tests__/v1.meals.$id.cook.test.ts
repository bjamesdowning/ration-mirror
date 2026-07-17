import { beforeEach, describe, expect, it, vi } from "vitest";

const requireMobileActiveGroup = vi.fn();
const checkRateLimit = vi.fn();
const cookMealWithConfirmation = vi.fn();
const tryStoreUndoToken = vi.fn();

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

vi.mock("~/lib/cook-confirmation.server", () => ({
	cookMealWithConfirmation: (...args: unknown[]) =>
		cookMealWithConfirmation(...args),
}));

vi.mock("~/lib/undo-token.server", () => ({
	tryStoreUndoToken: (...args: unknown[]) => tryStoreUndoToken(...args),
}));

const mealId = "22222222-2222-4222-8222-222222222222";
const ctx = { cloudflare: { env: { DB: {}, RATION_KV: {} } } } as never;

function postRequest(body: Record<string, unknown> = {}) {
	return new Request(
		`https://ration.mayutic.com/api/mobile/v1/meals/${mealId}/cook`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		},
	);
}

describe("POST /api/mobile/v1/meals/:id/cook", () => {
	beforeEach(() => {
		for (const m of [
			requireMobileActiveGroup,
			checkRateLimit,
			cookMealWithConfirmation,
			tryStoreUndoToken,
		]) {
			m.mockReset();
		}
		requireMobileActiveGroup.mockResolvedValue({
			userId: "user_1",
			organizationId: "org_1",
		});
		checkRateLimit.mockResolvedValue({ allowed: true });
		cookMealWithConfirmation.mockResolvedValue({
			cooked: true,
			ingredientsDeducted: 1,
			servings: 2,
			deductions: [{ cargoId: "cargo_1", quantity: 1 }],
		});
		tryStoreUndoToken.mockResolvedValue("undo_tok_cook");
	});

	it("returns cooked result and undo token on success", async () => {
		const { action } = await import("~/routes/api/mobile/v1.meals.$id.cook");
		const result = (await action({
			request: postRequest(),
			context: ctx,
			params: { id: mealId },
		} as never)) as {
			cooked: boolean;
			undoToken: string;
			ingredientsDeducted: number;
		};

		expect(result.cooked).toBe(true);
		expect(result.undoToken).toBe("undo_tok_cook");
		expect(result.ingredientsDeducted).toBe(1);
		expect(tryStoreUndoToken).toHaveBeenCalledTimes(1);
	});

	it("returns 200 with cooked true when undo token storage fails", async () => {
		tryStoreUndoToken.mockResolvedValue(undefined);

		const { action } = await import("~/routes/api/mobile/v1.meals.$id.cook");
		const result = (await action({
			request: postRequest(),
			context: ctx,
			params: { id: mealId },
		} as never)) as { cooked: boolean; undoToken?: string };

		expect(result.cooked).toBe(true);
		expect(result.undoToken).toBeUndefined();
	});

	it("does not store undo token when confirmation is required", async () => {
		cookMealWithConfirmation.mockResolvedValue({
			cooked: false,
			deductions: [],
			requiresConfirmation: true,
			missingIngredients: [
				{ name: "butter", required: 1, available: 0, unit: "tbsp" },
			],
		});

		const { action } = await import("~/routes/api/mobile/v1.meals.$id.cook");
		const result = (await action({
			request: postRequest(),
			context: ctx,
			params: { id: mealId },
		} as never)) as {
			cooked: boolean;
			requiresConfirmation?: boolean;
			missingIngredients?: unknown[];
		};

		expect(result.cooked).toBe(false);
		expect(result.requiresConfirmation).toBe(true);
		expect(result.missingIngredients).toHaveLength(1);
		expect(tryStoreUndoToken).not.toHaveBeenCalled();
	});
});
