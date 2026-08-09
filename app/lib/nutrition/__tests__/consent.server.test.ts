import { describe, expect, it, vi } from "vitest";

const selectLimit = vi.fn();
const insertValues = vi.fn();
const updateSet = vi.fn();

vi.mock("drizzle-orm/d1", () => ({
	drizzle: vi.fn(() => ({
		select: vi.fn(() => ({
			from: vi.fn().mockReturnThis(),
			where: vi.fn().mockReturnThis(),
			limit: selectLimit,
		})),
		insert: vi.fn(() => ({
			values: insertValues,
		})),
		update: vi.fn(() => ({
			set: updateSet.mockReturnValue({
				where: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
			}),
		})),
	})),
}));

describe("nutrition consent service", () => {
	it("grant is idempotent when active consent exists", async () => {
		selectLimit.mockResolvedValueOnce([
			{
				id: "c1",
				userId: "u1",
				purpose: "intake",
				policyVersion: "2026-08-01",
				source: "web",
				grantedAt: new Date("2026-08-01T00:00:00Z"),
				withdrawnAt: null,
			},
		]);
		const { grantNutritionConsent } = await import("../consent.server");
		const row = await grantNutritionConsent({} as D1Database, {
			userId: "u1",
			purpose: "intake",
			source: "web",
		});
		expect(row.id).toBe("c1");
		expect(insertValues).not.toHaveBeenCalled();
	});

	it("assertNutritionConsent throws when missing", async () => {
		selectLimit.mockResolvedValueOnce([]);
		const { assertNutritionConsent, NutritionConsentRequiredError } =
			await import("../consent.server");
		await expect(
			assertNutritionConsent({} as D1Database, "u1", "goals"),
		).rejects.toBeInstanceOf(NutritionConsentRequiredError);
	});
});
