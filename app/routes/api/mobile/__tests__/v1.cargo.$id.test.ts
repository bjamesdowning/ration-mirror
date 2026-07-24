import { beforeEach, describe, expect, it, vi } from "vitest";

const requireMobileActiveGroup = vi.fn();
const checkRateLimit = vi.fn();
const getCargoItem = vi.fn();
const attachTagsToCargo = vi.fn();
const getMealsForCargo = vi.fn();

vi.mock("~/lib/mobile/auth.server", () => ({
	requireMobileActiveGroup: (...args: unknown[]) =>
		requireMobileActiveGroup(...args),
}));

vi.mock("~/lib/cargo.server", async (importOriginal) => ({
	...(await importOriginal<typeof import("~/lib/cargo.server")>()),
	getCargoItem: (...args: unknown[]) => getCargoItem(...args),
	attachTagsToCargo: (...args: unknown[]) => attachTagsToCargo(...args),
	jettisonItem: vi.fn(),
	updateItem: vi.fn(),
}));

vi.mock("~/lib/meals.server", () => ({
	getMealsForCargo: (...args: unknown[]) => getMealsForCargo(...args),
}));

vi.mock("~/lib/rate-limiter.server", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("~/lib/rate-limiter.server")>();
	return {
		...actual,
		checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
	};
});

const ctx = { cloudflare: { env: { DB: {} } } } as never;

describe("GET /api/mobile/v1/cargo/:id loader", () => {
	beforeEach(() => {
		requireMobileActiveGroup.mockReset();
		getCargoItem.mockReset();
		attachTagsToCargo.mockReset();
		getMealsForCargo.mockReset();
		requireMobileActiveGroup.mockResolvedValue({
			userId: "user_1",
			organizationId: "org_1",
		});
	});

	it("returns the item with full tag records and connected meals", async () => {
		getCargoItem.mockResolvedValue({ id: "cargo_1", name: "Tomatoes" });
		attachTagsToCargo.mockResolvedValue([
			{
				id: "cargo_1",
				name: "Tomatoes",
				tags: [
					{
						id: "tag_pink",
						slug: "produce",
						name: "Produce",
						color: "#EC4899",
						category: null,
					},
				],
			},
		]);
		getMealsForCargo.mockResolvedValue([
			{
				id: "meal_1",
				name: "Pasta",
				type: "recipe",
				tags: [
					{
						id: "tag_1",
						slug: "dinner",
						name: "Dinner",
						color: null,
						category: null,
					},
				],
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
			item: {
				id: string;
				tags: {
					id: string;
					slug: string;
					name: string;
					color: string | null;
				}[];
			};
			connectedMeals: {
				name: string;
				tags: { id: string; slug: string; name: string }[];
			}[];
		};

		expect(result.item.id).toBe("cargo_1");
		expect(result.item.tags).toEqual([
			{
				id: "tag_pink",
				slug: "produce",
				name: "Produce",
				color: "#EC4899",
				category: null,
			},
		]);
		expect(result.connectedMeals).toHaveLength(1);
		expect(result.connectedMeals[0].name).toBe("Pasta");
		expect(result.connectedMeals[0].tags).toEqual([
			{
				id: "tag_1",
				slug: "dinner",
				name: "Dinner",
				color: null,
				category: null,
			},
		]);
		expect(attachTagsToCargo).toHaveBeenCalledWith({}, [
			{ id: "cargo_1", name: "Tomatoes" },
		]);
		expect(getMealsForCargo).toHaveBeenCalledWith(
			{},
			"org_1",
			"cargo_1",
			"Tomatoes",
		);
	});

	it("scopes the lookup to the active organization", async () => {
		getCargoItem.mockResolvedValue({ id: "cargo_9", name: "Flour" });
		attachTagsToCargo.mockResolvedValue([
			{ id: "cargo_9", name: "Flour", tags: [] },
		]);
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
