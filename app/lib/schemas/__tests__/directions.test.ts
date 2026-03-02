import { describe, expect, it } from "vitest";
import type { RecipeStep } from "~/lib/schemas/directions";
import {
	normalizeDirections,
	parseDirections,
	serializeDirections,
} from "~/lib/schemas/directions";

describe("normalizeDirections", () => {
	it("returns empty array for null", () => {
		expect(normalizeDirections(null)).toEqual([]);
	});

	it("returns empty array for undefined", () => {
		expect(normalizeDirections(undefined)).toEqual([]);
	});

	it("returns empty array for empty string", () => {
		expect(normalizeDirections("")).toEqual([]);
	});

	it("returns empty array for empty array", () => {
		expect(normalizeDirections([])).toEqual([]);
	});

	it("parses a newline-delimited string into steps with 1-indexed positions", () => {
		const raw =
			"Preheat oven to 200°C.\nMix flour and eggs.\nBake for 20 minutes.";
		const steps = normalizeDirections(raw);
		expect(steps).toHaveLength(3);
		expect(steps[0]).toEqual({ position: 1, text: "Preheat oven to 200°C." });
		expect(steps[1]).toEqual({ position: 2, text: "Mix flour and eggs." });
		expect(steps[2]).toEqual({ position: 3, text: "Bake for 20 minutes." });
	});

	it("strips numbered prefixes from string lines", () => {
		const raw = "1. Preheat oven.\n2. Mix ingredients.\n3) Bake.";
		const steps = normalizeDirections(raw);
		expect(steps[0].text).toBe("Preheat oven.");
		expect(steps[1].text).toBe("Mix ingredients.");
		expect(steps[2].text).toBe("Bake.");
	});

	it("parses a string[] from AI output into steps", () => {
		const raw = ["Preheat oven.", "Mix ingredients.", "Bake."];
		const steps = normalizeDirections(raw);
		expect(steps).toHaveLength(3);
		expect(steps[0].position).toBe(1);
		expect(steps[0].text).toBe("Preheat oven.");
	});

	it("strips numbered prefixes from string[] items", () => {
		const raw = ["1. Preheat oven.", "2) Mix ingredients.", "3. Bake."];
		const steps = normalizeDirections(raw);
		expect(steps[0].text).toBe("Preheat oven.");
		expect(steps[1].text).toBe("Mix ingredients.");
	});

	it("parses a RecipeStep[] and re-indexes positions", () => {
		const raw: RecipeStep[] = [
			{ position: 5, text: "Preheat oven." },
			{ position: 10, text: "Mix ingredients." },
		];
		const steps = normalizeDirections(raw);
		expect(steps).toHaveLength(2);
		expect(steps[0].position).toBe(1);
		expect(steps[1].position).toBe(2);
	});

	it("filters out empty steps from RecipeStep[]", () => {
		const raw: RecipeStep[] = [
			{ position: 1, text: "Preheat oven." },
			{ position: 2, text: "   " }, // whitespace-only
			{ position: 3, text: "Bake." },
		];
		const steps = normalizeDirections(raw);
		expect(steps).toHaveLength(2);
		expect(steps[0].text).toBe("Preheat oven.");
		expect(steps[1].text).toBe("Bake.");
	});

	it("preserves section headings from RecipeStep[]", () => {
		const raw: RecipeStep[] = [
			{ position: 1, text: "Mix dry ingredients.", section: "Dry Mix" },
		];
		const steps = normalizeDirections(raw);
		expect(steps[0].section).toBe("Dry Mix");
	});

	it("filters empty lines from string input", () => {
		const raw = "Step one.\n\n\nStep two.";
		const steps = normalizeDirections(raw);
		expect(steps).toHaveLength(2);
	});
});

describe("parseDirections", () => {
	it("returns empty array for null", () => {
		expect(parseDirections(null)).toEqual([]);
	});

	it("returns empty array for undefined", () => {
		expect(parseDirections(undefined)).toEqual([]);
	});

	it("parses a JSON string (new format)", () => {
		const steps: RecipeStep[] = [
			{ position: 1, text: "Preheat oven." },
			{ position: 2, text: "Bake." },
		];
		const json = JSON.stringify(steps);
		const result = parseDirections(json);
		expect(result).toHaveLength(2);
		expect(result[0].text).toBe("Preheat oven.");
	});

	it("parses a legacy newline-joined string (old format)", () => {
		const legacy = "Preheat oven.\nMix ingredients.\nBake.";
		const result = parseDirections(legacy);
		expect(result).toHaveLength(3);
	});

	it("passes through an already-parsed RecipeStep[]", () => {
		const steps: RecipeStep[] = [{ position: 1, text: "Preheat oven." }];
		const result = parseDirections(steps);
		expect(result).toHaveLength(1);
		expect(result[0].text).toBe("Preheat oven.");
	});

	it("returns empty array for empty string", () => {
		expect(parseDirections("")).toEqual([]);
	});
});

describe("serializeDirections / round-trip", () => {
	it("serializes steps to JSON string", () => {
		const steps: RecipeStep[] = [
			{ position: 1, text: "Preheat oven." },
			{ position: 2, text: "Bake for 20 minutes." },
		];
		const serialized = serializeDirections(steps);
		expect(typeof serialized).toBe("string");
		expect(serialized.startsWith("[")).toBe(true);
	});

	it("round-trips: serialize then parseDirections restores steps", () => {
		const original: RecipeStep[] = [
			{ position: 1, text: "Preheat oven." },
			{ position: 2, text: "Mix ingredients." },
			{ position: 3, text: "Bake for 20 minutes." },
		];
		const serialized = serializeDirections(original);
		const restored = parseDirections(serialized);
		expect(restored).toHaveLength(3);
		for (let i = 0; i < original.length; i++) {
			expect(restored[i].text).toBe(original[i].text);
			expect(restored[i].position).toBe(original[i].position);
		}
	});
});
