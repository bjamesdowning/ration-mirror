import { describe, expect, it } from "vitest";
import {
	hasStrongRecipeSignal,
	scoreRecipeSignal,
} from "~/lib/import/recipe-signal";

describe("recipe-signal", () => {
	it("scores thin captions low", () => {
		expect(scoreRecipeSignal("yummy!")).toBe(0);
		expect(hasStrongRecipeSignal("yummy dinner vibes")).toBe(false);
	});

	it("scores rich caption high enough to skip transcript", () => {
		const caption = `
Pasta Carbonara
200g spaghetti
100g pancetta
2 eggs
50g parmesan
1. Boil the pasta until al dente
2. Fry pancetta until crisp
3. Mix eggs and cheese, then toss with pasta
		`.trim();
		expect(scoreRecipeSignal(caption)).toBeGreaterThanOrEqual(4);
		expect(hasStrongRecipeSignal(caption)).toBe(true);
	});
});
