import { describe, expect, it } from "vitest";
import {
	AnyNutritionSnapshotSchema,
	ConsumePortionsSchema,
	NutritionGoalAsOfQuerySchema,
	NutritionGoalSchema,
	NutritionGoalUpsertSchema,
	NutritionRecomputeJobSchema,
	NutritionResolveRequestSchema,
	NutritionSnapshotSchema,
	NutritionSnapshotV2Schema,
	NutritionSummaryQuerySchema,
	NutritionSummarySchema,
} from "../nutrition";

describe("NutritionSnapshotSchema", () => {
	it("accepts a USDA snapshot", () => {
		const parsed = NutritionSnapshotSchema.parse({
			source: "usda",
			confidence: 1,
			verified: true,
			per100g: {
				energyKcal: 52,
				proteinG: 0.3,
				fatG: 0.2,
				carbG: 14,
				fiberG: 2.4,
				sugarG: 10,
				satFatG: 0,
				sodiumMg: 1,
				saltG: 0,
			},
			perServing: null,
			fdcId: 9003,
			description: "Apples, raw",
		});
		expect(parsed.source).toBe("usda");
		expect(parsed.fdcId).toBe(9003);
	});

	it("rejects confidence outside 0–1", () => {
		expect(() =>
			NutritionSnapshotSchema.parse({
				source: "ai_estimate",
				confidence: 1.5,
				verified: false,
				per100g: null,
				perServing: null,
				fdcId: null,
				description: null,
			}),
		).toThrow();
	});
});

describe("NutritionSnapshotV2Schema", () => {
	it("accepts v2 additive fields with nullable nutrients", () => {
		const parsed = NutritionSnapshotV2Schema.parse({
			schemaVersion: 2,
			source: "usda",
			confidence: 1,
			verified: true,
			sourceRef: "fdc:9003",
			matchQuality: "verified",
			servingBasis: "per100g",
			nutrientCoverage: 0.9,
			per100g: {
				energyKcal: 52,
				proteinG: null,
				fatG: 0.2,
				carbG: 14,
				fiberG: 2.4,
				sugarG: null,
				satFatG: 0,
				sodiumMg: 1,
				saltG: null,
			},
			perServing: null,
			fdcId: 9003,
			description: "Apples, raw",
		});
		expect(parsed.schemaVersion).toBe(2);
		expect(parsed.per100g?.proteinG).toBeNull();
	});

	it("accepts legacy v1 via union schema", () => {
		const parsed = AnyNutritionSnapshotSchema.parse({
			source: "usda",
			confidence: 1,
			verified: true,
			per100g: null,
			perServing: null,
			fdcId: null,
			description: null,
		});
		expect(parsed.source).toBe("usda");
	});
});

describe("NutritionRecomputeWakeSchema", () => {
	it("accepts PII-free wake payload", async () => {
		const { NutritionRecomputeWakeSchema } = await import(
			"~/lib/schemas/nutrition"
		);
		const parsed = NutritionRecomputeWakeSchema.parse({
			schemaVersion: 1,
			type: "nutrition.recompute.wake",
			jobKey: "meal:abc",
			sentAt: "2026-08-09T12:00:00.000Z",
		});
		expect(parsed.jobKey).toBe("meal:abc");
	});

	it("rejects payloads with organizationId", async () => {
		const { NutritionRecomputeWakeSchema } = await import(
			"~/lib/schemas/nutrition"
		);
		const parsed = NutritionRecomputeWakeSchema.safeParse({
			schemaVersion: 1,
			type: "nutrition.recompute.wake",
			jobKey: "meal:abc",
			sentAt: "2026-08-09T12:00:00.000Z",
			organizationId: "org-1",
		});
		expect(parsed.success).toBe(false);
	});
});

describe("NutritionRecomputeJobSchema", () => {
	it("accepts legacy async recompute queue message", () => {
		const parsed = NutritionRecomputeJobSchema.parse({
			jobId: "11111111-1111-4111-8111-111111111111",
			organizationId: "org-1",
			mealId: "meal-1",
			trigger: "meal",
			enqueuedAt: "2026-08-09T12:00:00.000Z",
		});
		expect(parsed.trigger).toBe("meal");
	});
});

describe("ConsumePortionsSchema", () => {
	it("requires YYYY-MM-DD manifestDate and positive servings", () => {
		const parsed = ConsumePortionsSchema.parse({
			servings: "2",
			manifestDate: "2026-08-09",
			slotType: "lunch",
		});
		expect(parsed.servings).toBe(2);
		expect(parsed.manifestDate).toBe("2026-08-09");
	});

	it("rejects invalid date", () => {
		expect(() =>
			ConsumePortionsSchema.parse({
				servings: 1,
				manifestDate: "08/09/2026",
			}),
		).toThrow();
	});
});

describe("NutritionGoalSchema", () => {
	it("accepts macros and effectiveFrom", () => {
		const parsed = NutritionGoalSchema.parse({
			dailyEnergyKcal: 2200,
			proteinG: 120,
			carbsG: 250,
			fatG: 70,
			fiberG: 30,
			effectiveFrom: "2026-08-01",
		});
		expect(parsed.dailyEnergyKcal).toBe(2200);
		expect(parsed.fiberG).toBe(30);
	});

	it("accepts partial targets (kcal + protein only)", () => {
		const parsed = NutritionGoalSchema.parse({
			dailyEnergyKcal: 2000,
			proteinG: 200,
			effectiveFrom: "2026-08-01",
		});
		expect(parsed.dailyEnergyKcal).toBe(2000);
		expect(parsed.proteinG).toBe(200);
		expect(parsed.carbsG).toBeNull();
		expect(parsed.fatG).toBeNull();
		expect(parsed.fiberG).toBeNull();
	});

	it("rejects empty nutrient targets", () => {
		expect(() =>
			NutritionGoalSchema.parse({
				effectiveFrom: "2026-08-01",
			}),
		).toThrow();
	});
});

describe("NutritionSummarySchema", () => {
	it("accepts summary response shape", () => {
		const parsed = NutritionSummarySchema.parse({
			from: "2026-08-01",
			to: "2026-08-09",
			totals: {
				energyKcal: 1000,
				proteinG: 50,
				carbsG: 100,
				fatG: 40,
			},
			days: [
				{
					date: "2026-08-01",
					energyKcal: 1000,
					proteinG: 50,
					carbsG: 100,
					fatG: 40,
					coverageAvg: 0.9,
					entryCount: 2,
				},
			],
			goal: null,
		});
		expect(parsed.days).toHaveLength(1);
	});
});

describe("NutritionSummaryQuerySchema", () => {
	it("accepts from/to range", () => {
		const parsed = NutritionSummaryQuerySchema.parse({
			from: "2026-08-01",
			to: "2026-08-09",
		});
		expect(parsed.from).toBe("2026-08-01");
	});

	it("rejects inverted range", () => {
		expect(() =>
			NutritionSummaryQuerySchema.parse({
				from: "2026-08-10",
				to: "2026-08-01",
			}),
		).toThrow();
	});

	it("rejects spans longer than 93 days", () => {
		expect(() =>
			NutritionSummaryQuerySchema.parse({
				from: "2026-01-01",
				to: "2026-05-01",
			}),
		).toThrow();
	});
});

describe("NutritionGoalAsOfQuerySchema", () => {
	it("accepts optional asOf", () => {
		expect(NutritionGoalAsOfQuerySchema.parse({}).asOf).toBeUndefined();
		expect(
			NutritionGoalAsOfQuerySchema.parse({ asOf: "2026-08-09" }).asOf,
		).toBe("2026-08-09");
	});

	it("rejects invalid asOf", () => {
		expect(() =>
			NutritionGoalAsOfQuerySchema.parse({ asOf: "08/09/2026" }),
		).toThrow();
		expect(() =>
			NutritionGoalAsOfQuerySchema.parse({ asOf: "2026-02-31" }),
		).toThrow();
	});
});

describe("NutritionGoalUpsertSchema", () => {
	it("accepts nutrient fields without a client consent signal", () => {
		const parsed = NutritionGoalUpsertSchema.parse({
			dailyEnergyKcal: 2000,
			proteinG: 100,
			carbsG: 200,
			fatG: 70,
			effectiveFrom: "2026-08-09",
			operationKey: "11111111-1111-4111-8111-111111111111",
		});
		expect(parsed.dailyEnergyKcal).toBe(2000);
	});

	it("rejects legacy consent fields at the nutrition write boundary", () => {
		expect(() =>
			NutritionGoalUpsertSchema.parse({
				dailyEnergyKcal: 2000,
				effectiveFrom: "2026-08-09",
				operationKey: "11111111-1111-4111-8111-111111111111",
				consentAt: "2026-08-09T12:00:00.000Z",
			}),
		).toThrow();
		expect(() =>
			NutritionGoalUpsertSchema.parse({
				dailyEnergyKcal: 2000,
				effectiveFrom: "2026-08-09",
				operationKey: "11111111-1111-4111-8111-111111111111",
				consent: true,
			}),
		).toThrow();
	});

	it("accepts zero kcal as an explicit energy target", () => {
		const parsed = NutritionGoalUpsertSchema.parse({
			dailyEnergyKcal: 0,
			effectiveFrom: "2026-08-09",
			operationKey: "11111111-1111-4111-8111-111111111111",
		});
		expect(parsed.dailyEnergyKcal).toBe(0);
	});

	it("treats empty string energy as unset (undefined → null)", () => {
		const parsed = NutritionGoalUpsertSchema.parse({
			dailyEnergyKcal: "",
			proteinG: 100,
			effectiveFrom: "2026-08-09",
			operationKey: "11111111-1111-4111-8111-111111111111",
		});
		expect(parsed.dailyEnergyKcal).toBeNull();
		expect(parsed.proteinG).toBe(100);
	});

	it("rejects all-null nutrient upsert", () => {
		expect(() =>
			NutritionGoalUpsertSchema.parse({
				dailyEnergyKcal: null,
				proteinG: null,
				carbsG: null,
				fatG: null,
				fiberG: null,
				effectiveFrom: "2026-08-09",
				operationKey: "11111111-1111-4111-8111-111111111111",
			}),
		).toThrow();
	});
});

describe("Cook and Eat request schemas", () => {
	it("accepts CookEntriesRequestSchema", async () => {
		const { CookEntriesRequestSchema } = await import("../manifest");
		const parsed = CookEntriesRequestSchema.parse({
			entryIds: ["11111111-1111-4111-8111-111111111111"],
			confirmInsufficient: true,
		});
		expect(parsed.entryIds).toHaveLength(1);
		expect(parsed.confirmInsufficient).toBe(true);
	});

	it("accepts ManifestPersonalIntakeUpsertSchema with 0.5 servings", async () => {
		const { ManifestPersonalIntakeUpsertSchema } = await import("../manifest");
		const parsed = ManifestPersonalIntakeUpsertSchema.parse({
			servings: 0.5,
			idempotencyKey: "22222222-2222-4222-8222-222222222222",
		});
		expect(parsed.servings).toBe(0.5);
	});

	it("accepts 0.25 servings and amount+unit", async () => {
		const { ManifestPersonalIntakeUpsertSchema } = await import("../manifest");
		expect(
			ManifestPersonalIntakeUpsertSchema.parse({
				servings: 0.25,
				idempotencyKey: "22222222-2222-4222-8222-222222222222",
			}).servings,
		).toBe(0.25);
		const mass = ManifestPersonalIntakeUpsertSchema.parse({
			amount: 180,
			unit: "g",
			idempotencyKey: "22222222-2222-4222-8222-222222222222",
		});
		expect(mass.amount).toBe(180);
		expect(mass.unit).toBe("g");
	});

	it("rejects client-provided consent on the Eat write", async () => {
		const { ManifestPersonalIntakeUpsertSchema } = await import("../manifest");
		expect(() =>
			ManifestPersonalIntakeUpsertSchema.parse({
				servings: 1,
				idempotencyKey: "22222222-2222-4222-8222-222222222222",
				consent: true,
			}),
		).toThrow();
	});

	it("rejects servings below 0.01 and missing amount", async () => {
		const { ManifestPersonalIntakeUpsertSchema } = await import("../manifest");
		expect(() =>
			ManifestPersonalIntakeUpsertSchema.parse({
				servings: 0.009,
				idempotencyKey: "22222222-2222-4222-8222-222222222222",
			}),
		).toThrow();
		expect(() =>
			ManifestPersonalIntakeUpsertSchema.parse({
				servings: 0,
				idempotencyKey: "22222222-2222-4222-8222-222222222222",
			}),
		).toThrow();
		expect(() =>
			ManifestPersonalIntakeUpsertSchema.parse({
				idempotencyKey: "22222222-2222-4222-8222-222222222222",
			}),
		).toThrow();
	});
});

describe("ConsumeEntriesRequestSchema portions", () => {
	it("accepts portions and logNutrition", async () => {
		const { ConsumeEntriesRequestSchema } = await import("../manifest");
		const parsed = ConsumeEntriesRequestSchema.parse({
			entryIds: ["11111111-1111-4111-8111-111111111111"],
			logNutrition: false,
			portions: [
				{
					entryId: "11111111-1111-4111-8111-111111111111",
					servings: 1.5,
				},
			],
		});
		expect(parsed.portions?.[0]?.servings).toBe(1.5);
		expect(parsed.logNutrition).toBe(false);
	});
});

describe("NutritionResolveRequestSchema", () => {
	it("accepts 1–50 names", () => {
		const parsed = NutritionResolveRequestSchema.parse({
			names: ["apple", "banana"],
		});
		expect(parsed.names).toEqual(["apple", "banana"]);
	});

	it("accepts optional ingestSource scan_review", () => {
		const parsed = NutritionResolveRequestSchema.parse({
			names: ["mystery snack"],
			ingestSource: "scan_review",
		});
		expect(parsed.ingestSource).toBe("scan_review");
	});

	it("still accepts deprecated allowAiEstimate without enabling ingestSource", () => {
		const parsed = NutritionResolveRequestSchema.parse({
			names: ["mystery snack"],
			allowAiEstimate: true,
		});
		expect(parsed.allowAiEstimate).toBe(true);
		expect(parsed.ingestSource).toBeUndefined();
	});

	it("rejects empty names", () => {
		expect(() => NutritionResolveRequestSchema.parse({ names: [] })).toThrow();
	});

	it("rejects more than 50 names", () => {
		expect(() =>
			NutritionResolveRequestSchema.parse({
				names: Array.from({ length: 51 }, (_, i) => `item-${i}`),
			}),
		).toThrow();
	});
});

describe("iOS 1.3.17-shaped payloads (nutrition keys absent)", () => {
	it("consume request without portions still validates", async () => {
		const { ConsumeEntriesRequestSchema } = await import("../manifest");
		const parsed = ConsumeEntriesRequestSchema.parse({
			entryIds: ["11111111-1111-4111-8111-111111111111"],
		});
		expect(parsed.portions).toBeUndefined();
		expect(parsed.logNutrition).toBeUndefined();
	});

	it("batch cargo item without nutrition still validates", async () => {
		const { BatchAddCargoSchema } = await import("../scan");
		const result = BatchAddCargoSchema.safeParse({
			items: [
				{
					name: "Milk",
					quantity: 1,
					unit: "l",
					domain: "food",
					tags: [],
				},
			],
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.items[0].nutrition).toBeUndefined();
		}
	});
});
