import { describe, expect, it } from "vitest";
import {
	energyGlance,
	selectAteFoods,
	selectNextMeal,
	selectSupplyPreview,
	widgetAteAction,
} from "../home-widgets";

describe("widgetAteAction", () => {
	it("eats one discrete count and opens weight, volume, and dozen", () => {
		expect(widgetAteAction("slice")).toBe("eat");
		expect(widgetAteAction(" Pack ")).toBe("eat");
		expect(widgetAteAction("g")).toBe("open");
		expect(widgetAteAction("ml")).toBe("open");
		expect(widgetAteAction("dozen")).toBe("open");
		expect(widgetAteAction("kg")).toBe("open");
	});
});

describe("selectAteFoods", () => {
	it("prefers one-tap foods and caps the row", () => {
		const foods = selectAteFoods([
			{ id: "g", name: "Cheddar", unit: "g" },
			{ id: "s", name: "Bread", unit: "slice" },
			{ id: "s", name: "Bread duplicate", unit: "slice" },
			{ id: "d", name: "Eggs", unit: "dozen" },
			{ id: "c", name: "Beans", unit: "can" },
			{ id: "p", name: "Yogurt", unit: "pack" },
			{ id: "u", name: "Apple", unit: "unit" },
		]);
		expect(foods.map((food) => food.cargoId)).toEqual(["s", "c", "p", "u"]);
		expect(foods.every((food) => food.action === "eat")).toBe(true);
		expect(foods[0]?.stepQuantity).toBe(1);
	});

	it("fills with open-amount foods when count steps are scarce", () => {
		const foods = selectAteFoods([
			{ id: "g", name: "Milk", unit: "ml" },
			{ id: "s", name: "  Ham  ", unit: "slice" },
		]);
		expect(foods.map((food) => [food.name, food.action])).toEqual([
			["Ham", "eat"],
			["Milk", "open"],
		]);
	});
});

describe("selectSupplyPreview", () => {
	it("keeps the first five named rows", () => {
		const items = ["a", "b", "c", "d", "e", "f"].map((id) => ({
			id,
			name: id,
		}));
		expect(
			selectSupplyPreview([{ id: "", name: "nope" }, ...items]),
		).toHaveLength(5);
		expect(selectSupplyPreview(items)[0]?.id).toBe("a");
	});
});

describe("selectNextMeal", () => {
	it("skips a cooked breakfast and keeps lunch", () => {
		expect(
			selectNextMeal([
				{
					name: "Oats",
					slotType: "breakfast",
					orderIndex: 0,
					cooked: true,
				},
				{
					name: "Soup",
					slotType: "lunch",
					orderIndex: 1,
					cooked: false,
				},
				{
					name: "Stew",
					slotType: "dinner",
					orderIndex: 0,
					cooked: false,
				},
			]),
		).toEqual({ status: "planned", title: "Soup" });
	});

	it("distinguishes an empty day from a finished day", () => {
		expect(selectNextMeal([])).toEqual({ status: "clear", title: null });
		expect(
			selectNextMeal([
				{ name: "Stew", slotType: "dinner", orderIndex: 0, cooked: true },
			]),
		).toEqual({ status: "done", title: null });
	});
});

describe("energyGlance", () => {
	it("returns signed remaining kcal only for a positive goal", () => {
		expect(energyGlance(2000, 1500.4)).toEqual({
			remainingKcal: 500,
			goalKcal: 2000,
		});
		expect(energyGlance(1800, 1900)).toEqual({
			remainingKcal: -100,
			goalKcal: 1800,
		});
		expect(energyGlance(null, 10)).toBeNull();
		expect(energyGlance(0, 0)).toBeNull();
		expect(energyGlance(2000, Number.NaN)).toBeNull();
	});
});
