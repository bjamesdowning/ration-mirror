import { describe, expect, it } from "vitest";
import { serializeNutritionSummary } from "~/lib/nutrition/dto.server";
import type { LogManifestIntakesResult } from "~/lib/nutrition/service.server";
import { projectToolResult } from "../response-profile";
import {
	compactManifestIntakeResult,
	withPerDayVsGoal,
} from "../result-shapes";

type IntakeRow = LogManifestIntakesResult["items"][number]["intake"];

function intakeRow(overrides: Partial<IntakeRow> = {}): IntakeRow {
	return {
		id: "intake-1",
		organizationId: "org-1",
		userId: "user-1",
		planId: "plan-1",
		entryId: "entry-1",
		mealId: "meal-1",
		organizationNameSnapshot: "Kitchen",
		mealNameSnapshot: "Lentil soup",
		manifestDate: "2026-11-25",
		fuelDate: null,
		slotType: "dinner",
		servings: 1.5,
		energyKcal: 630,
		proteinG: 36,
		carbsG: 90,
		fatG: 13.5,
		coverage: 1,
		source: "manifest",
		confidence: 1,
		verified: 0,
		occurredAt: new Date("2026-11-25T19:00:00.000Z"),
		kitchenEventId: null,
		schemaVersion: 2,
		nutrientsJson: { energyKcal: 630, sodiumMg: 900 },
		coverageJson: { energyKcal: 1 },
		fiberG: 18,
		consentId: "consent-1",
		idempotencyKey: "idem-1",
		operationId: "op-1",
		replacesIntakeId: null,
		voidOperationId: null,
		voidedAt: null,
		voidedByUserId: null,
		notes: null,
		loggedAmount: null,
		loggedUnit: null,
		createdAt: new Date("2026-11-25T19:00:00.000Z"),
		...overrides,
	} as IntakeRow;
}

function logResult(rows: IntakeRow[]): LogManifestIntakesResult {
	return {
		operationId: "op-1",
		replayed: false,
		undoExpiresAt: new Date("2026-11-25T19:05:00.000Z"),
		summaryGeneratedAt: "2026-11-25T19:00:00.000Z",
		items: rows.map((intake) => ({
			intake,
			replacedIntakeId: null,
			replayed: false,
		})),
		dayTotals: [
			{
				date: "2026-11-25",
				energyKcal: 630,
				proteinG: 36,
				carbsG: 90,
				fatG: 13.5,
				coverageAvg: 1,
				entryCount: 1,
			},
		],
	};
}

describe("compactManifestIntakeResult", () => {
	it("returns one compact line per plate-up", () => {
		const compact = compactManifestIntakeResult(logResult([intakeRow()]));
		expect(compact).toEqual({
			logged: 1,
			operationId: "op-1",
			replayed: false,
			undoExpiresAt: new Date("2026-11-25T19:05:00.000Z"),
			summaryGeneratedAt: "2026-11-25T19:00:00.000Z",
			items: [
				{
					intakeId: "intake-1",
					entryId: "entry-1",
					replacedIntakeId: null,
					replayed: false,
					mealName: "Lentil soup",
					date: "2026-11-25",
					slot: "dinner",
					servings: 1.5,
					amount: 1.5,
					unit: "serving",
					energyKcal: 630,
					proteinG: 36,
					carbsG: 90,
					fatG: 13.5,
					fiberG: 18,
				},
			],
			dayTotals: logResult([]).dayTotals,
		});
	});

	it("prefers the Fuel day and the logged amount+unit", () => {
		const compact = compactManifestIntakeResult(
			logResult([
				intakeRow({
					fuelDate: "2026-11-24",
					loggedAmount: 180,
					loggedUnit: "g",
					notes: "half portion",
				}),
			]),
		);
		expect(compact.items[0]).toMatchObject({
			date: "2026-11-24",
			amount: 180,
			unit: "g",
			notes: "half portion",
		});
	});

	it("keeps no internal ids or nutrient bags after projection", () => {
		const projected = projectToolResult({
			tool: "log_manifest_intake",
			profile: "agent",
			data: compactManifestIntakeResult(logResult([intakeRow()])),
		});
		const encoded = JSON.stringify(projected.data);
		for (const key of [
			"organizationId",
			"userId",
			"consentId",
			"nutrientsJson",
			"coverageJson",
			"idempotencyKey",
		]) {
			expect(encoded).not.toContain(`"${key}"`);
		}
		expect(encoded).toContain('"undoExpiresAt":"2026-11-25T19:05:00.000Z"');
	});

	it("stays within the size budget for the 50-item maximum", () => {
		const rows = Array.from({ length: 50 }, (_, index) =>
			intakeRow({
				id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
				entryId: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
			}),
		);
		const raw = JSON.stringify(logResult(rows));
		const projected = projectToolResult({
			tool: "log_manifest_intake",
			profile: "agent",
			data: compactManifestIntakeResult(logResult(rows)),
		});
		const compact = JSON.stringify(projected.data);
		expect(compact.length).toBeLessThan(18_000);
		expect(compact.length).toBeLessThan(raw.length / 2);
	});
});

describe("withPerDayVsGoal", () => {
	const summary = serializeNutritionSummary({
		from: "2026-11-24",
		to: "2026-11-25",
		totals: { energyKcal: 2400, proteinG: 100, carbsG: 250, fatG: 80 },
		days: [
			{
				date: "2026-11-24",
				energyKcal: 1800,
				proteinG: 70,
				carbsG: 200,
				fatG: 60,
				coverageAvg: 1,
				entryCount: 3,
			},
			{
				date: "2026-11-25",
				energyKcal: 600,
				proteinG: 30,
				carbsG: 50,
				fatG: 20,
				coverageAvg: 1,
				entryCount: 1,
			},
		],
		goal: {
			dailyEnergyKcal: 2000,
			proteinG: 120,
			carbsG: null,
			fatG: null,
			fiberG: null,
			effectiveFrom: "2026-11-01",
			effectiveTo: null,
		},
	} as Parameters<typeof serializeNutritionSummary>[0]);

	it("adds each day's vsGoal to the top-level days", () => {
		const shaped = withPerDayVsGoal(summary);
		expect(shaped.days.map((day) => day.vsGoal?.energyKcal)).toEqual([
			{ consumed: 1800, target: 2000, remaining: 200, overage: null },
			{ consumed: 600, target: 2000, remaining: 1400, overage: null },
		]);
		expect(shaped.vsGoal).toEqual(summary.vsGoal);
	});

	it("survives the agent projection that drops nutritionV2", () => {
		const projected = projectToolResult({
			tool: "get_nutrition_summary",
			profile: "agent",
			data: withPerDayVsGoal(summary),
		}).data as { days: Array<{ vsGoal: unknown }>; nutritionV2?: unknown };
		expect(projected.nutritionV2).toBeUndefined();
		expect(projected.days[1]?.vsGoal).toMatchObject({
			energyKcal: { remaining: 1400 },
		});
	});

	it("does not change the shared serializer output", () => {
		expect(summary.days[0]).not.toHaveProperty("vsGoal");
	});
});
