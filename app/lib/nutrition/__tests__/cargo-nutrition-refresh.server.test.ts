import { beforeEach, describe, expect, it, vi } from "vitest";

const getCargoItem = vi.fn();
const updateItem = vi.fn();
const maybeResolveCargoNutrition = vi.fn();

vi.mock("~/lib/cargo.server", () => ({
	getCargoItem: (...args: unknown[]) => getCargoItem(...args),
	updateItem: (...args: unknown[]) => updateItem(...args),
}));

vi.mock("../persist.server", () => ({
	maybeResolveCargoNutrition: (...args: unknown[]) =>
		maybeResolveCargoNutrition(...args),
}));

vi.mock("../dto.server", () => ({
	serializeNutritionSnapshot: (snap: unknown) => snap,
}));

describe("refreshCargoNutritionFromUsda", () => {
	const env = { DB: {} } as Env;
	const flagContext = { clientPlatform: "web" };
	const cargoRow = {
		id: "cargo_1",
		name: "oats",
		quantity: 1,
		unit: "kg",
		nutrition: null,
	};

	beforeEach(() => {
		getCargoItem.mockReset();
		updateItem.mockReset();
		maybeResolveCargoNutrition.mockReset();
		getCargoItem.mockResolvedValue(cargoRow);
	});

	it("returns null when cargo is missing", async () => {
		getCargoItem.mockResolvedValue(null);
		const { refreshCargoNutritionFromUsda } = await import(
			"../cargo-nutrition-refresh.server"
		);
		const result = await refreshCargoNutritionFromUsda(
			env,
			"org_1",
			"missing",
			flagContext,
			{ userId: "user_1" },
		);
		expect(result).toBeNull();
		expect(maybeResolveCargoNutrition).not.toHaveBeenCalled();
	});

	it("persists USDA snapshot on match and never requests AI", async () => {
		const usda = {
			source: "usda" as const,
			confidence: 0.95,
			verified: false,
			per100g: {
				energyKcal: 389,
				proteinG: 17,
				fatG: 7,
				carbG: 66,
				fiberG: null,
				sugarG: null,
				satFatG: null,
				sodiumMg: null,
				saltG: null,
			},
			perServing: null,
			fdcId: 123,
			description: "Oats",
		};
		maybeResolveCargoNutrition.mockResolvedValue(usda);
		updateItem.mockResolvedValue({ ...cargoRow, nutrition: usda });

		const { refreshCargoNutritionFromUsda } = await import(
			"../cargo-nutrition-refresh.server"
		);
		const result = await refreshCargoNutritionFromUsda(
			env,
			"org_1",
			"cargo_1",
			flagContext,
			{ userId: "user_1" },
		);

		expect(maybeResolveCargoNutrition).toHaveBeenCalledWith(
			env,
			"oats",
			flagContext,
			expect.objectContaining({
				allowAiEstimate: false,
				organizationId: "org_1",
				userId: "user_1",
			}),
		);
		expect(updateItem).toHaveBeenCalledWith(
			env,
			"org_1",
			"cargo_1",
			{},
			expect.objectContaining({
				userId: "user_1",
				flagContext,
				setNutrition: usda,
			}),
		);
		expect(result).toEqual(
			expect.objectContaining({
				matched: true,
				nutrition: usda,
				message: undefined,
			}),
		);
	});

	it("clears nutrition on miss with none-found message", async () => {
		maybeResolveCargoNutrition.mockResolvedValue(null);
		updateItem.mockResolvedValue({ ...cargoRow, nutrition: null });

		const {
			CARGO_NUTRITION_REFRESH_NONE_FOUND,
			refreshCargoNutritionFromUsda,
		} = await import("../cargo-nutrition-refresh.server");
		const result = await refreshCargoNutritionFromUsda(
			env,
			"org_1",
			"cargo_1",
			flagContext,
			{ userId: "user_1" },
		);

		expect(updateItem).toHaveBeenCalledWith(
			env,
			"org_1",
			"cargo_1",
			{},
			expect.objectContaining({
				userId: "user_1",
				setNutrition: null,
			}),
		);
		expect(result).toEqual(
			expect.objectContaining({
				matched: false,
				nutrition: null,
				message: CARGO_NUTRITION_REFRESH_NONE_FOUND,
			}),
		);
	});
});
