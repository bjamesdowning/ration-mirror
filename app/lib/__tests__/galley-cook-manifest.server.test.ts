import { beforeEach, describe, expect, it, vi } from "vitest";

const isFeatureEnabled = vi.fn();
const cookMealWithConfirmation = vi.fn();
const ensureMealPlan = vi.fn();
const cookManifestEntries = vi.fn();
const addEntry = vi.fn();
const deleteEntry = vi.fn();
const updateEntry = vi.fn();

vi.mock("~/lib/feature-flags/flags.server", () => ({
	isFeatureEnabled: (...args: unknown[]) => isFeatureEnabled(...args),
}));

vi.mock("~/lib/cook-confirmation.server", () => ({
	cookMealWithConfirmation: (...args: unknown[]) =>
		cookMealWithConfirmation(...args),
}));

vi.mock("~/lib/manifest.server", async () => {
	const actual = await vi.importActual<typeof import("~/lib/manifest.server")>(
		"~/lib/manifest.server",
	);
	return {
		...actual,
		ensureMealPlan: (...args: unknown[]) => ensureMealPlan(...args),
		addEntry: (...args: unknown[]) => addEntry(...args),
		deleteEntry: (...args: unknown[]) => deleteEntry(...args),
		updateEntry: (...args: unknown[]) => updateEntry(...args),
	};
});

vi.mock("~/lib/manifest-cook.server", async () => {
	const actual = await vi.importActual<
		typeof import("~/lib/manifest-cook.server")
	>("~/lib/manifest-cook.server");
	return {
		...actual,
		cookManifestEntries: (...args: unknown[]) => cookManifestEntries(...args),
	};
});

vi.mock("drizzle-orm/d1", () => {
	function makeChain(result: unknown[] = []) {
		const chain: {
			from: ReturnType<typeof vi.fn>;
			innerJoin: ReturnType<typeof vi.fn>;
			where: ReturnType<typeof vi.fn>;
			limit: ReturnType<typeof vi.fn>;
			then: (onFulfilled: (v: unknown) => unknown) => Promise<unknown>;
		} = {
			from: vi.fn(),
			innerJoin: vi.fn(),
			where: vi.fn(),
			limit: vi.fn(async () => result),
			// biome-ignore lint/suspicious/noThenProperty: drizzle query chain is awaitable
			then: (onFulfilled) => Promise.resolve(result).then(onFulfilled),
		};
		chain.from.mockReturnValue(chain);
		chain.innerJoin.mockReturnValue(chain);
		chain.where.mockReturnValue(chain);
		return chain;
	}
	return {
		drizzle: vi.fn(() => ({
			select: vi.fn(() => makeChain([])),
		})),
	};
});

describe("cookMealFromGalley", () => {
	beforeEach(() => {
		isFeatureEnabled.mockReset();
		cookMealWithConfirmation.mockReset();
		ensureMealPlan.mockReset();
		cookManifestEntries.mockReset();
		addEntry.mockReset();
		deleteEntry.mockReset();
		updateEntry.mockReset();
	});

	it("uses legacy cookMeal when nutrition-cook-log-split is off", async () => {
		isFeatureEnabled.mockResolvedValue(false);
		cookMealWithConfirmation.mockResolvedValue({
			cooked: true,
			deductions: [{ cargoId: "c1", quantity: 1 }],
			servings: 2,
			eventIds: ["e1"],
		});

		const { cookMealFromGalley } = await import(
			"../galley-cook-manifest.server"
		);
		const result = await cookMealFromGalley({} as Env, "org-1", "meal-1", {
			flagContext: { userId: "u1" },
			date: "2026-08-09",
			localHour: 18,
			userId: "u1",
		});

		expect(cookMealWithConfirmation).toHaveBeenCalled();
		expect(cookManifestEntries).not.toHaveBeenCalled();
		expect(result.bridgedToManifest).toBe(false);
		expect(result.offerPersonalLog).toBe(false);
		expect(result.cooked).toBe(true);
	});

	it("uses legacy cook when date is omitted even if flag on", async () => {
		isFeatureEnabled.mockResolvedValue(true);
		cookMealWithConfirmation.mockResolvedValue({
			cooked: true,
			deductions: [],
			servings: 1,
			eventIds: [],
		});

		const { cookMealFromGalley } = await import(
			"../galley-cook-manifest.server"
		);
		const result = await cookMealFromGalley({} as Env, "org-1", "meal-1", {
			flagContext: { userId: "u1", clientVersion: "1.3.24" },
			userId: "u1",
		});

		expect(result.bridgedToManifest).toBe(false);
		expect(cookManifestEntries).not.toHaveBeenCalled();
	});

	it("bridges onto Manifest when flag on and date provided", async () => {
		isFeatureEnabled.mockImplementation(async (_env, flag: string) => {
			if (flag === "nutrition-cook-log-split") return true;
			if (flag === "nutrition-manifest") return true;
			return false;
		});
		ensureMealPlan.mockResolvedValue({ id: "plan-1" });
		addEntry.mockResolvedValue({
			id: "entry-1",
			planId: "plan-1",
			mealId: "meal-1",
			date: "2026-08-09",
			slotType: "dinner",
			orderIndex: 0,
			servingsOverride: 2,
			notes: null,
			consumedAt: null,
			cookedAt: null,
			createdAt: new Date(),
			mealName: "Pasta",
			mealServings: 2,
			mealType: "recipe",
			mealPrepTime: null,
			mealCookTime: null,
		});
		cookManifestEntries.mockResolvedValue({
			cooked: 1,
			entryIds: ["entry-1"],
			planId: "plan-1",
			deductions: [{ cargoId: "c1", quantity: 1 }],
			eventIds: ["evt-1"],
			alreadyCookedIds: [],
		});

		const { cookMealFromGalley } = await import(
			"../galley-cook-manifest.server"
		);
		const result = await cookMealFromGalley({} as Env, "org-1", "meal-1", {
			flagContext: { userId: "u1", clientVersion: "1.3.24" },
			date: "2026-08-09",
			localHour: 18,
			servings: 2,
			userId: "u1",
		});

		expect(ensureMealPlan).toHaveBeenCalled();
		expect(addEntry).toHaveBeenCalled();
		expect(cookManifestEntries).toHaveBeenCalledWith(
			expect.anything(),
			"org-1",
			"plan-1",
			["entry-1"],
			expect.objectContaining({ userId: "u1" }),
		);
		expect(cookMealWithConfirmation).not.toHaveBeenCalled();
		expect(result.bridgedToManifest).toBe(true);
		expect(result.offerPersonalLog).toBe(true);
		expect(result.autoCreated).toBe(true);
		expect(result.entry?.id).toBe("entry-1");
		expect(result.cooked).toBe(true);
	});

	it("deletes auto-created entry when cook requires confirmation", async () => {
		isFeatureEnabled.mockImplementation(async (_env, flag: string) => {
			if (flag === "nutrition-cook-log-split") return true;
			return false;
		});
		ensureMealPlan.mockResolvedValue({ id: "plan-1" });
		addEntry.mockResolvedValue({
			id: "entry-new",
			planId: "plan-1",
			mealId: "meal-1",
			date: "2026-08-09",
			slotType: "dinner",
			orderIndex: 0,
			servingsOverride: null,
			notes: null,
			consumedAt: null,
			cookedAt: null,
			createdAt: new Date(),
			mealName: "Pasta",
			mealServings: 1,
			mealType: "recipe",
			mealPrepTime: null,
			mealCookTime: null,
		});
		cookManifestEntries.mockResolvedValue({
			cooked: 0,
			entryIds: [],
			planId: "plan-1",
			deductions: [],
			eventIds: [],
			alreadyCookedIds: [],
			requiresConfirmation: true,
			missingIngredients: [
				{ name: "flour", required: 2, available: 0, unit: "cup" },
			],
		});
		deleteEntry.mockResolvedValue(true);

		const { cookMealFromGalley } = await import(
			"../galley-cook-manifest.server"
		);
		const result = await cookMealFromGalley({} as Env, "org-1", "meal-1", {
			flagContext: { userId: "u1" },
			date: "2026-08-09",
			localHour: 18,
			userId: "u1",
		});

		expect(result.requiresConfirmation).toBe(true);
		expect(result.autoCreated).toBe(false);
		expect(result.entry).toBeUndefined();
		expect(deleteEntry).toHaveBeenCalledWith(
			undefined,
			"org-1",
			"plan-1",
			"entry-new",
		);
	});
});
