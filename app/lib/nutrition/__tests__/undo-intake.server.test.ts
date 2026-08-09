import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~/lib/feature-flags/flags.server", () => ({
	isFeatureEnabled: vi.fn(),
}));

import { isFeatureEnabled } from "~/lib/feature-flags/flags.server";
import { NutritionScopeError, undoIntake } from "../service.server";

const env = {} as Env;
const flags = {};
const principal = {
	userId: "user-1",
	organizationId: "org-1",
	surface: "web" as const,
	authMethod: "session",
	scopes: ["nutrition:write"],
};

describe("undoIntake flag-off fallback", () => {
	beforeEach(() => {
		vi.mocked(isFeatureEnabled).mockReset();
	});

	it("allows KV cook/consume fallback when cook-log-split is off", async () => {
		vi.mocked(isFeatureEnabled).mockResolvedValue(false);
		const token = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

		await expect(
			undoIntake(env, principal, flags, token),
		).rejects.toMatchObject({
			name: "NutritionUndoUnavailableError",
			fallbackAllowed: true,
		});
		expect(isFeatureEnabled).toHaveBeenCalledWith(
			env,
			"nutrition-cook-log-split",
			flags,
		);
	});

	it("allows KV fallback for non-UUID tokens when cook-log-split is on", async () => {
		vi.mocked(isFeatureEnabled).mockResolvedValue(true);

		await expect(
			undoIntake(env, principal, flags, "not-a-uuid"),
		).rejects.toMatchObject({
			name: "NutritionUndoUnavailableError",
			fallbackAllowed: true,
		});
	});

	it("still requires nutrition:write scope", async () => {
		vi.mocked(isFeatureEnabled).mockResolvedValue(false);
		await expect(
			undoIntake(
				env,
				{ ...principal, scopes: ["nutrition:read"] },
				flags,
				"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
			),
		).rejects.toBeInstanceOf(NutritionScopeError);
	});
});
