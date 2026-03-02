import { describe, expect, it } from "vitest";
import { buildWeekPlanPrompt, type PromptMeal } from "~/lib/week-plan-prompt";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeMeal = (overrides: Partial<PromptMeal> = {}): PromptMeal => ({
	id: crypto.randomUUID(),
	name: "Chicken Stir-Fry",
	tags: ["dinner"],
	type: "recipe",
	...overrides,
});

const BASE_CONFIG = {
	days: 3,
	startDate: "2026-03-02",
	slots: ["breakfast", "dinner"] as (
		| "breakfast"
		| "lunch"
		| "dinner"
		| "snack"
	)[],
	variety: "medium" as const,
	tag: undefined,
	dietaryNote: undefined,
};

const WEEK_DATES = [
	"2026-03-02",
	"2026-03-03",
	"2026-03-04",
	"2026-03-05",
	"2026-03-06",
	"2026-03-07",
	"2026-03-08",
];

// ---------------------------------------------------------------------------
// buildWeekPlanPrompt
// ---------------------------------------------------------------------------

describe("buildWeekPlanPrompt", () => {
	it("returns both systemPrompt and userPrompt strings", () => {
		const meals = [makeMeal()];
		const { systemPrompt, userPrompt } = buildWeekPlanPrompt({
			meals,
			config: BASE_CONFIG,
			weekDates: WEEK_DATES,
		});
		expect(typeof systemPrompt).toBe("string");
		expect(typeof userPrompt).toBe("string");
		expect(systemPrompt.length).toBeGreaterThan(0);
		expect(userPrompt.length).toBeGreaterThan(0);
	});

	it("includes only the requested number of dates in the user prompt", () => {
		const meals = [makeMeal()];
		const { userPrompt } = buildWeekPlanPrompt({
			meals,
			config: { ...BASE_CONFIG, days: 2 },
			weekDates: WEEK_DATES,
		});
		// Should mention the first 2 dates, not all 7
		expect(userPrompt).toContain("2026-03-02");
		expect(userPrompt).toContain("2026-03-03");
		expect(userPrompt).not.toContain("2026-03-04");
	});

	it("includes requested slot types in the user prompt", () => {
		const meals = [makeMeal()];
		const { userPrompt } = buildWeekPlanPrompt({
			meals,
			config: { ...BASE_CONFIG, slots: ["lunch", "dinner"] },
			weekDates: WEEK_DATES,
		});
		expect(userPrompt).toContain("lunch");
		expect(userPrompt).toContain("dinner");
	});

	it("embeds the dietaryNote in a <preference> tag when provided", () => {
		const meals = [makeMeal()];
		const { userPrompt } = buildWeekPlanPrompt({
			meals,
			config: { ...BASE_CONFIG, dietaryNote: "no shellfish" },
			weekDates: WEEK_DATES,
		});
		expect(userPrompt).toContain("<preference>");
		expect(userPrompt).toContain("no shellfish");
		expect(userPrompt).toContain("</preference>");
	});

	it("omits the <preference> block when dietaryNote is absent", () => {
		const meals = [makeMeal()];
		const { userPrompt } = buildWeekPlanPrompt({
			meals,
			config: BASE_CONFIG,
			weekDates: WEEK_DATES,
		});
		expect(userPrompt).not.toContain("<preference>");
	});

	it("includes the tag filter instruction when tag is provided", () => {
		const meals = [makeMeal()];
		const { userPrompt } = buildWeekPlanPrompt({
			meals,
			config: { ...BASE_CONFIG, tag: "vegetarian" },
			weekDates: WEEK_DATES,
		});
		expect(userPrompt).toContain("vegetarian");
	});

	it("omits tag instruction when tag is absent", () => {
		const meals = [makeMeal()];
		const { userPrompt } = buildWeekPlanPrompt({
			meals,
			config: BASE_CONFIG,
			weekDates: WEEK_DATES,
		});
		expect(userPrompt).not.toContain("Prefer meals tagged");
	});

	it("includes variety description in the system prompt", () => {
		const meals = [makeMeal()];
		const { systemPrompt: highPrompt } = buildWeekPlanPrompt({
			meals,
			config: { ...BASE_CONFIG, variety: "high" },
			weekDates: WEEK_DATES,
		});
		const { systemPrompt: lowPrompt } = buildWeekPlanPrompt({
			meals,
			config: { ...BASE_CONFIG, variety: "low" },
			weekDates: WEEK_DATES,
		});
		// High and low variety prompts should differ
		expect(highPrompt).not.toBe(lowPrompt);
		// Each should contain its own description
		expect(highPrompt).toContain("Unique meals for every slot");
		expect(lowPrompt).toContain("May repeat meals");
	});

	it("serialises all meal IDs into the system prompt catalogue", () => {
		const m1 = makeMeal({ name: "Omelette", tags: ["breakfast"] });
		const m2 = makeMeal({ name: "Lentil Soup", tags: ["dinner"] });
		const { systemPrompt } = buildWeekPlanPrompt({
			meals: [m1, m2],
			config: BASE_CONFIG,
			weekDates: WEEK_DATES,
		});
		expect(systemPrompt).toContain(m1.id);
		expect(systemPrompt).toContain(m2.id);
	});

	it("truncates long meal names to 80 characters in the catalogue", () => {
		const longName = "A".repeat(100);
		const meal = makeMeal({ name: longName });
		const { systemPrompt } = buildWeekPlanPrompt({
			meals: [meal],
			config: BASE_CONFIG,
			weekDates: WEEK_DATES,
		});
		// The 80-char truncated name should appear, not the full 100-char name
		expect(systemPrompt).toContain("A".repeat(80));
		expect(systemPrompt).not.toContain("A".repeat(81));
	});

	it("handles an empty meals array without throwing", () => {
		expect(() =>
			buildWeekPlanPrompt({
				meals: [],
				config: BASE_CONFIG,
				weekDates: WEEK_DATES,
			}),
		).not.toThrow();
	});

	it("limits meal tags to 8 per meal in the catalogue", () => {
		const manyTags = Array.from({ length: 12 }, (_, i) => `tag-${i}`);
		const meal = makeMeal({ tags: manyTags });
		const { systemPrompt } = buildWeekPlanPrompt({
			meals: [meal],
			config: BASE_CONFIG,
			weekDates: WEEK_DATES,
		});
		// Should contain tags 0–7 but not 8–11
		expect(systemPrompt).toContain("tag-7");
		expect(systemPrompt).not.toContain("tag-8");
	});
});
