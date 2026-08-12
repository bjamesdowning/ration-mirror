import { describe, expect, it } from "vitest";
import type { MealPlanEntryWithMeal } from "~/lib/manifest.server";
import { serializeManifestEntryForWire } from "~/lib/manifest-wire.server";

const baseEntry = {
	id: "entry-1",
	planId: "plan-1",
	mealId: "meal-1",
	date: "2026-08-12",
	slotType: "snack",
	orderIndex: 0,
	servingsOverride: null,
	notes: null,
	consumedAt: null,
	cookedAt: new Date("2026-08-12T12:00:00.000Z"),
	createdAt: new Date("2026-08-12T11:00:00.000Z"),
	mealName: "Almonds",
	mealServings: 1,
	mealType: "provision",
	mealPrepTime: null,
	mealCookTime: null,
} satisfies MealPlanEntryWithMeal;

describe("serializeManifestEntryForWire", () => {
	it("emits ISO date strings and numeric macros", () => {
		const wire = serializeManifestEntryForWire({
			...baseEntry,
			mealEnergyKcalPerServing: "90" as unknown as number,
			mealProteinGPerServing: "3.5" as unknown as number,
			personalIntake: {
				id: "intake-1",
				servings: "1" as unknown as number,
				energyKcal: "90" as unknown as number,
				proteinG: "3.5" as unknown as number,
				carbsG: "2" as unknown as number,
				fatG: "8" as unknown as number,
				occurredAt: "2026-08-12T12:05:00.000Z",
				notes: null,
			},
		});

		expect(wire.createdAt).toBe("2026-08-12T11:00:00.000Z");
		expect(wire.cookedAt).toBe("2026-08-12T12:00:00.000Z");
		expect(wire.mealEnergyKcalPerServing).toBe(90);
		expect(wire.mealProteinGPerServing).toBe(3.5);
		expect(wire.personalIntake?.servings).toBe(1);
		expect(wire.personalIntake?.energyKcal).toBe(90);
		expect(wire.personalIntake?.occurredAt).toBe("2026-08-12T12:05:00.000Z");
	});

	it("truncates fractional Int-backed fields for mobile Codable", () => {
		const wire = serializeManifestEntryForWire({
			...baseEntry,
			orderIndex: 1.9 as unknown as number,
			servingsOverride: 2.5 as unknown as number,
			mealServings: "3" as unknown as number,
		});

		expect(wire.orderIndex).toBe(1);
		expect(wire.servingsOverride).toBe(2);
		expect(wire.mealServings).toBe(3);
	});
});
