import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { MealPlanEntryWithMeal } from "~/lib/manifest.server";
import { serializeManifestEntryForWire } from "~/lib/manifest-wire.server";

const fixturePath = join(
	dirname(fileURLToPath(import.meta.url)),
	"../../../__fixtures__/mobile/manifest-populated.json",
);

describe("mobile Manifest populated wire contract", () => {
	it("accepts the shared golden Manifest fixture shape", () => {
		const payload = JSON.parse(readFileSync(fixturePath, "utf8")) as {
			entries: unknown[];
		};
		expect(payload.entries).toHaveLength(1);
		const entry = payload.entries[0] as Record<string, unknown>;
		expect(typeof entry.createdAt).toBe("string");
		expect(typeof entry.cookedAt).toBe("string");
		expect(entry.mealEnergyKcalPerServing).toBe(90);
		const intake = entry.personalIntake as Record<string, unknown>;
		expect(intake.energyKcal).toBe(90);
		expect(typeof intake.occurredAt).toBe("string");
	});

	it("round-trips a string-numeric entry through the serializer into golden shape", () => {
		const entry: MealPlanEntryWithMeal = {
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
			mealEnergyKcalPerServing: "90" as unknown as number,
			mealProteinGPerServing: "3.5" as unknown as number,
			mealCarbsGPerServing: "2" as unknown as number,
			mealFatGPerServing: "8" as unknown as number,
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
		};
		const wire = serializeManifestEntryForWire(entry);
		expect(wire.mealEnergyKcalPerServing).toBe(90);
		expect(wire.personalIntake?.proteinG).toBe(3.5);
		expect(wire.cookedAt).toBe("2026-08-12T12:00:00.000Z");
	});
});
