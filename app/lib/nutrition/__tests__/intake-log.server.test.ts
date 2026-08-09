import { beforeEach, describe, expect, it, vi } from "vitest";

const assertFeatureEnabled = vi.fn();
const assertNutritionConsent = vi.fn();
const grantNutritionConsent = vi.fn();
const replaceActivePersonalIntake = vi.fn();
const voidActivePersonalIntake = vi.fn();
const getActivePersonalIntakeForEntry = vi.fn();

vi.mock("../../feature-flags/assert-enabled.server", () => ({
	assertFeatureEnabled: (...args: unknown[]) => assertFeatureEnabled(...args),
}));

vi.mock("../consent.server", async () => {
	const actual =
		await vi.importActual<typeof import("../consent.server")>(
			"../consent.server",
		);
	return {
		...actual,
		assertNutritionConsent: (...args: unknown[]) =>
			assertNutritionConsent(...args),
		grantNutritionConsent: (...args: unknown[]) =>
			grantNutritionConsent(...args),
	};
});

vi.mock("../persist.server", async () => {
	const actual =
		await vi.importActual<typeof import("../persist.server")>(
			"../persist.server",
		);
	return {
		...actual,
		replaceActivePersonalIntake: (...args: unknown[]) =>
			replaceActivePersonalIntake(...args),
		voidActivePersonalIntake: (...args: unknown[]) =>
			voidActivePersonalIntake(...args),
		getActivePersonalIntakeForEntry: (...args: unknown[]) =>
			getActivePersonalIntakeForEntry(...args),
	};
});

const planId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const entryId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const mealId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const orgId = "org-1";
const userId = "user-1";

let selectCall = 0;

vi.mock("drizzle-orm/d1", () => ({
	drizzle: vi.fn(() => ({
		select: vi.fn(() => {
			selectCall += 1;
			const chain = {
				from: vi.fn().mockReturnThis(),
				innerJoin: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				limit: vi.fn(),
			};
			if (selectCall === 1) {
				chain.limit.mockResolvedValue([{ id: planId }]);
			} else if (selectCall === 2) {
				chain.limit.mockResolvedValue([
					{
						id: entryId,
						mealId,
						date: "2026-07-30",
						slotType: "dinner",
						cookedAt: new Date("2026-07-30T12:00:00.000Z"),
						consumedAt: new Date("2026-07-30T12:00:00.000Z"),
						mealNutrition: {
							perServing: {
								energyKcal: 500,
								proteinG: 20,
								fatG: 10,
								carbG: 60,
								fiberG: 5,
								sugarG: 2,
								satFatG: 3,
								sodiumMg: 400,
								saltG: 1,
							},
							coverage: 1,
						},
					},
				]);
			} else {
				chain.limit.mockResolvedValue([]);
			}
			return chain;
		}),
	})),
}));

const env = { DB: {} } as Env;

describe("upsertManifestPersonalIntake", () => {
	beforeEach(() => {
		selectCall = 0;
		assertFeatureEnabled.mockReset();
		assertFeatureEnabled.mockResolvedValue(undefined);
		assertNutritionConsent.mockReset();
		grantNutritionConsent.mockReset();
		replaceActivePersonalIntake.mockReset();
		voidActivePersonalIntake.mockReset();
		vi.resetModules();
	});

	it("requires intake consent or consent:true grant", async () => {
		const { NutritionConsentRequiredError } = await import("../consent.server");
		assertNutritionConsent.mockRejectedValue(
			new NutritionConsentRequiredError("intake"),
		);

		const { upsertManifestPersonalIntake } = await import(
			"../intake-log.server"
		);
		await expect(
			upsertManifestPersonalIntake(env, {
				organizationId: orgId,
				userId,
				planId,
				entryId,
				servings: 1,
				idempotencyKey: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
				flagContext: { userId, clientPlatform: "ios", clientVersion: "1.3.25" },
			}),
		).rejects.toMatchObject({ code: "nutrition_consent_required" });

		expect(grantNutritionConsent).not.toHaveBeenCalled();
		expect(replaceActivePersonalIntake).not.toHaveBeenCalled();
	});

	it("grants consent when consent:true and upserts scaled intake", async () => {
		const { NutritionConsentRequiredError } = await import("../consent.server");
		assertNutritionConsent.mockRejectedValue(
			new NutritionConsentRequiredError("intake"),
		);
		grantNutritionConsent.mockResolvedValue({ id: "consent-1" });
		replaceActivePersonalIntake.mockResolvedValue({
			row: {
				id: "intake-1",
				entryId,
				servings: 1.5,
				energyKcal: 750,
				proteinG: 30,
				carbsG: 90,
				fatG: 15,
				occurredAt: new Date("2026-07-30T13:00:00.000Z"),
			},
			replacedId: null,
		});

		const { upsertManifestPersonalIntake } = await import(
			"../intake-log.server"
		);
		const result = await upsertManifestPersonalIntake(env, {
			organizationId: orgId,
			userId,
			planId,
			entryId,
			servings: 1.5,
			idempotencyKey: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
			consent: true,
			consentSource: "web",
			flagContext: { userId, clientPlatform: "web", clientVersion: "1.7.49" },
		});

		expect(assertFeatureEnabled).toHaveBeenCalledWith(
			env,
			"nutrition-cook-log-split",
			expect.objectContaining({
				clientPlatform: "web",
				clientVersion: "1.7.49",
			}),
		);

		expect(grantNutritionConsent).toHaveBeenCalledWith(
			env.DB,
			expect.objectContaining({ purpose: "intake", source: "web" }),
		);
		expect(replaceActivePersonalIntake).toHaveBeenCalledWith(
			env.DB,
			expect.objectContaining({
				servings: 1.5,
				energyKcal: 750,
				kitchenEventId: null,
				idempotencyKey: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
			}),
		);
		expect(result.idempotent).toBe(false);
		expect(result.intake.servings).toBe(1.5);
	});

	it("rejects when meal nutrition is missing", async () => {
		assertNutritionConsent.mockResolvedValue({ id: "c" });
		selectCall = 0;
		vi.doMock("drizzle-orm/d1", () => ({
			drizzle: vi.fn(() => ({
				select: vi.fn(() => {
					selectCall += 1;
					const chain = {
						from: vi.fn().mockReturnThis(),
						innerJoin: vi.fn().mockReturnThis(),
						where: vi.fn().mockReturnThis(),
						limit: vi.fn(),
					};
					if (selectCall === 1) {
						chain.limit.mockResolvedValue([{ id: planId }]);
					} else if (selectCall === 2) {
						chain.limit.mockResolvedValue([
							{
								id: entryId,
								mealId,
								date: "2026-07-30",
								slotType: "dinner",
								cookedAt: new Date(),
								consumedAt: new Date(),
								mealNutrition: null,
							},
						]);
					} else {
						chain.limit.mockResolvedValue([]);
					}
					return chain;
				}),
			})),
		}));

		const { upsertManifestPersonalIntake } = await import(
			"../intake-log.server"
		);
		await expect(
			upsertManifestPersonalIntake(env, {
				organizationId: orgId,
				userId,
				planId,
				entryId,
				servings: 1,
				idempotencyKey: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
				consent: true,
				flagContext: { userId },
			}),
		).rejects.toMatchObject({ code: "nutrition_unavailable" });
	});
});
