import { beforeEach, describe, expect, it, vi } from "vitest";

const cookMeal = vi.fn();
const getMealMissingIngredients = vi.fn();
const buildCargoDeductionStatements = vi.fn();
const bumpReadinessCacheVersions = vi.fn();
const buildKitchenEventInserts = vi.fn();
const buildManifestCookedEvent = vi.fn((input: unknown) => input);

vi.mock("../meals.server", () => ({
	cookMeal: (...args: unknown[]) => cookMeal(...args),
}));

vi.mock("../matching.server", () => ({
	getMealMissingIngredients: (...args: unknown[]) =>
		getMealMissingIngredients(...args),
}));

vi.mock("../cargo-deduction.server", () => ({
	buildCargoDeductionStatements: (...args: unknown[]) =>
		buildCargoDeductionStatements(...args),
}));

vi.mock("../readiness-cache.server", () => ({
	bumpReadinessCacheVersions: (...args: unknown[]) =>
		bumpReadinessCacheVersions(...args),
}));

vi.mock("../kitchen-events.server", () => ({
	buildKitchenEventInserts: (...args: unknown[]) =>
		buildKitchenEventInserts(...args),
	buildManifestCookedEvent: (input: unknown) => buildManifestCookedEvent(input),
}));

const planId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const entryId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const mealId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const orgId = "org-1";

let selectCall = 0;
const updateSet = vi.fn().mockReturnValue({
	where: vi.fn().mockResolvedValue(undefined),
});
const batch = vi.fn().mockResolvedValue(undefined);
const deductionStmt = { kind: "cargo-deduction" };

vi.mock("drizzle-orm/d1", () => ({
	drizzle: vi.fn(() => ({
		select: vi.fn(() => {
			selectCall += 1;
			if (selectCall === 1) {
				return {
					from: vi.fn().mockReturnThis(),
					where: vi.fn().mockReturnThis(),
					limit: vi.fn().mockResolvedValue([{ id: planId }]),
				};
			}
			return {
				from: vi.fn().mockReturnThis(),
				innerJoin: vi.fn().mockReturnThis(),
				where: vi.fn().mockResolvedValue([
					{
						id: entryId,
						mealId,
						date: "2026-07-30",
						slotType: "dinner",
						servingsOverride: null,
						cookedAt: null,
						consumedAt: null,
						mealServings: 2,
						mealName: "Pasta",
					},
				]),
			};
		}),
		update: vi.fn(() => ({
			set: updateSet,
		})),
		batch,
	})),
}));

const env = { DB: {}, RATION_KV: {} } as Env;

describe("cookManifestEntries", () => {
	beforeEach(() => {
		selectCall = 0;
		cookMeal.mockReset();
		getMealMissingIngredients.mockReset();
		buildCargoDeductionStatements.mockReset();
		bumpReadinessCacheVersions.mockReset();
		buildKitchenEventInserts.mockReset();
		buildManifestCookedEvent.mockClear();
		buildCargoDeductionStatements.mockResolvedValue([deductionStmt]);
		bumpReadinessCacheVersions.mockResolvedValue(undefined);
		buildKitchenEventInserts.mockReturnValue({
			stmts: [{ kind: "kitchen-event" }],
			eventIds: ["evt-cook-1"],
		});
		updateSet.mockClear();
		batch.mockClear();
		vi.resetModules();
	});

	it("returns requiresConfirmation when cargo is insufficient", async () => {
		getMealMissingIngredients.mockResolvedValue([
			{ name: "chicken", required: 2, available: 0, unit: "lb" },
		]);

		const { cookManifestEntries } = await import("../manifest-cook.server");
		const result = await cookManifestEntries(env, orgId, planId, [entryId]);

		expect(result.requiresConfirmation).toBe(true);
		expect(result.cooked).toBe(0);
		expect(cookMeal).not.toHaveBeenCalled();
		expect(batch).not.toHaveBeenCalled();
	});

	it("deducts cargo once, dual-writes cookedAt/consumedAt, emits manifest_cooked", async () => {
		getMealMissingIngredients.mockResolvedValue([]);
		cookMeal.mockResolvedValue({
			deductions: [{ cargoId: "cargo-1", quantity: 1 }],
		});

		const { cookManifestEntries } = await import("../manifest-cook.server");
		const result = await cookManifestEntries(env, orgId, planId, [entryId], {
			userId: "user-1",
			source: "web",
		});

		expect(result.cooked).toBe(1);
		expect(result.entryIds).toEqual([entryId]);
		expect(result.eventIds).toEqual(["evt-cook-1"]);
		expect(result.deductions).toEqual([{ cargoId: "cargo-1", quantity: 1 }]);
		expect(buildManifestCookedEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				mealId,
				planId,
				entryIds: [entryId],
				source: "web",
			}),
		);
		const cookedPayload = buildManifestCookedEvent.mock.calls[0]?.[0] as {
			payload?: unknown;
		};
		expect(JSON.stringify(cookedPayload)).not.toMatch(
			/energyKcal|consent|goal/i,
		);
		expect(updateSet).toHaveBeenCalledWith(
			expect.objectContaining({
				cookedAt: expect.any(Date),
				cookedByUserId: "user-1",
				consumedAt: expect.any(Date),
			}),
		);
		expect(batch).toHaveBeenCalled();
		expect(bumpReadinessCacheVersions).toHaveBeenCalled();
	});

	it("is idempotent for already-prepared entries without re-deducting", async () => {
		selectCall = 0;
		vi.doMock("drizzle-orm/d1", () => ({
			drizzle: vi.fn(() => ({
				select: vi.fn(() => {
					selectCall += 1;
					if (selectCall === 1) {
						return {
							from: vi.fn().mockReturnThis(),
							where: vi.fn().mockReturnThis(),
							limit: vi.fn().mockResolvedValue([{ id: planId }]),
						};
					}
					return {
						from: vi.fn().mockReturnThis(),
						innerJoin: vi.fn().mockReturnThis(),
						where: vi.fn().mockResolvedValue([
							{
								id: entryId,
								mealId,
								date: "2026-07-30",
								slotType: "dinner",
								servingsOverride: null,
								cookedAt: null,
								consumedAt: new Date("2026-07-30T12:00:00.000Z"),
								mealServings: 2,
								mealName: "Pasta",
							},
						]),
					};
				}),
				update: vi.fn(() => ({ set: updateSet })),
				batch,
			})),
		}));

		getMealMissingIngredients.mockResolvedValue([]);
		const { cookManifestEntries } = await import("../manifest-cook.server");
		const result = await cookManifestEntries(env, orgId, planId, [entryId]);

		expect(result.cooked).toBe(0);
		expect(result.alreadyCookedIds).toEqual([entryId]);
		expect(cookMeal).not.toHaveBeenCalled();
		expect(batch).not.toHaveBeenCalled();
	});
});
