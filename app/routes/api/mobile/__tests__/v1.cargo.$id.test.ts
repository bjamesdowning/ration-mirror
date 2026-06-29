import { beforeEach, describe, expect, it, vi } from "vitest";

const requireMobileActiveGroup = vi.fn();
const getCargoItem = vi.fn();
const getMealsForCargo = vi.fn();

vi.mock("~/lib/mobile/auth.server", () => ({
	requireMobileActiveGroup: (...args: unknown[]) =>
		requireMobileActiveGroup(...args),
}));

vi.mock("~/lib/cargo.server", async (importOriginal) => ({
	...(await importOriginal<typeof import("~/lib/cargo.server")>()),
	getCargoItem: (...args: unknown[]) => getCargoItem(...args),
	jettisonItem: vi.fn(),
	updateItem: vi.fn(),
}));

vi.mock("~/lib/meals.server", () => ({
	getMealsForCargo: (...args: unknown[]) => getMealsForCargo(...args),
}));

vi.mock("~/lib/rate-limiter.server", () => ({
	checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}));

const ctx = { cloudflare: { env: { DB: {} } } } as never;

describe("GET /api/mobile/v1/cargo/:id loader", () => {
	beforeEach(() => {
		requireMobileActiveGroup.mockReset();
		getCargoItem.mockReset();
		getMealsForCargo.mockReset();
		requireMobileActiveGroup.mockResolvedValue({
			userId: "user_1",
			organizationId: "org_1",
		});
	});

	it("returns the item with connected meals", async () => {
		getCargoItem.mockResolvedValue({ id: "cargo_1", name: "Tomatoes" });
		getMealsForCargo.mockResolvedValue([
			{
				id: "meal_1",
				name: "Pasta",
				type: "recipe",
				tags: ["dinner"],
				connectedIngredients: [],
			},
		]);

		const { loader } = await import("~/routes/api/mobile/v1.cargo.$id");
		const result = (await loader({
			request: new Request(
				"https://ration.mayutic.com/api/mobile/v1/cargo/cargo_1",
			),
			context: ctx,
			params: { id: "cargo_1" },
		} as never)) as {
			item: { id: string };
			connectedMeals: { name: string }[];
		};

		expect(result.item.id).toBe("cargo_1");
		expect(result.connectedMeals).toHaveLength(1);
		expect(result.connectedMeals[0].name).toBe("Pasta");
		expect(getMealsForCargo).toHaveBeenCalledWith(
			{},
			"org_1",
			"cargo_1",
			"Tomatoes",
		);
	});

	it("scopes the lookup to the active organization", async () => {
		getCargoItem.mockResolvedValue({ id: "cargo_9", name: "Flour" });
		getMealsForCargo.mockResolvedValue([]);

		const { loader } = await import("~/routes/api/mobile/v1.cargo.$id");
		await loader({
			request: new Request(
				"https://ration.mayutic.com/api/mobile/v1/cargo/cargo_9",
			),
			context: ctx,
			params: { id: "cargo_9" },
		} as never);

		expect(getCargoItem).toHaveBeenCalledWith({}, "org_1", "cargo_9");
	});
});
