import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	QuickEatValidationError,
	quickEatFromCargo,
} from "~/lib/cargo-quick-eat.server";
import { createMockEnv } from "~/test/helpers/mock-env";

vi.mock("~/lib/feature-flags/assert-enabled.server", () => ({
	assertFeatureEnabled: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("~/lib/feature-flags/flags.server", () => ({
	isFeatureEnabled: vi.fn().mockResolvedValue(true),
}));

vi.mock("~/lib/meals.server", () => ({
	ensureProvisionFromCargo: vi.fn(),
}));

vi.mock("~/lib/galley-cook-manifest.server", () => ({
	cookMealFromGalley: vi.fn(),
}));

vi.mock("~/lib/nutrition/service.server", () => ({
	logManifestIntakes: vi.fn(),
}));

describe("quickEatFromCargo", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("rejects non-positive quantity before DB work", async () => {
		const env = createMockEnv();
		await expect(
			quickEatFromCargo(
				env,
				"org-1",
				{
					userId: "user-1",
					organizationId: "org-1",
					surface: "mobile",
					authMethod: "mobile_bearer",
					scopes: ["nutrition:write"],
				},
				{ userId: "user-1" } as never,
				{
					cargoId: "cargo-1",
					quantity: 0,
					date: "2026-08-11",
					operationKey: "11111111-1111-4111-8111-111111111111",
				},
			),
		).rejects.toBeInstanceOf(QuickEatValidationError);
	});
});
