import { describe, expect, it } from "vitest";
import { D1_MAX_BOUND_PARAMS } from "~/lib/query-utils.server";
import {
	buildNutritionOperationResultJson,
	canonicalNutritionRequest,
	deriveNutritionOperationKey,
	hashNutritionRequest,
	logManifestIntakes,
	MAX_NUTRITION_OPERATION_ITEMS,
	mealSnapshotAllowsIntake,
	NutritionOperationValidationError,
	NutritionScopeError,
	resolveHttpOperationKey,
} from "../service.server";
import type { MealNutritionSnapshot } from "../types";

const env = {} as Env;
const flags = {};
const principal = {
	userId: "user-1",
	organizationId: "org-1",
	surface: "web" as const,
	authMethod: "session",
	scopes: ["nutrition:write"],
};

describe("canonical nutrition operation requests", () => {
	it("produces the same representation regardless of object key order", async () => {
		const left = { operation: "log", nested: { servings: 1, entryId: "e1" } };
		const right = { nested: { entryId: "e1", servings: 1 }, operation: "log" };

		expect(canonicalNutritionRequest(left)).toBe(
			canonicalNutritionRequest(right),
		);
		expect(await hashNutritionRequest(left)).toBe(
			await hashNutritionRequest(right),
		);
	});

	it("changes the request hash when committed input changes", async () => {
		const base = { entryId: "e1", servings: 1 };
		expect(await hashNutritionRequest(base)).not.toBe(
			await hashNutritionRequest({ ...base, servings: 2 }),
		);
	});

	it("derives a stable UUID from ordered per-item compatibility keys", async () => {
		const left = await deriveNutritionOperationKey(["b", "a"]);
		const right = await deriveNutritionOperationKey(["a", "b"]);
		expect(left).toBe(right);
		expect(left).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/,
		);
	});

	it("requires matching header and compatibility operation keys", () => {
		const key = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
		expect(resolveHttpOperationKey(new Headers(), key)).toBe(key);
		expect(
			resolveHttpOperationKey(new Headers({ "Idempotency-Key": key }), key),
		).toBe(key);
		expect(() =>
			resolveHttpOperationKey(
				new Headers({
					"Idempotency-Key": "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
				}),
				key,
			),
		).toThrow(NutritionOperationValidationError);
	});
});

describe("mealSnapshotAllowsIntake", () => {
	const usable: MealNutritionSnapshot = {
		perServing: {
			energyKcal: 0,
			proteinG: 0,
			fatG: 0,
			carbG: 0,
			fiberG: 0,
			sugarG: 0,
			satFatG: 0,
			sodiumMg: 0,
			saltG: 0,
		},
		coverage: 1,
		attributions: [
			{
				ingredientIndex: 0,
				ingredientName: "diet soda",
				fdcId: null,
				source: "user_override",
				grams: 100,
				contribution: {
					energyKcal: 0,
					proteinG: 0,
					fatG: 0,
					carbG: 0,
					fiberG: 0,
					sugarG: 0,
					satFatG: 0,
					sodiumMg: 0,
					saltG: 0,
				},
			},
		],
		computedAt: "2026-08-12T00:00:00.000Z",
	};

	it("allows zero-kcal foods with real coverage", () => {
		expect(mealSnapshotAllowsIntake(usable)).toBe(true);
	});

	it("rejects unresolved zero-filled aggregates", () => {
		expect(
			mealSnapshotAllowsIntake({
				...usable,
				coverage: 0,
				attributions: [],
			}),
		).toBe(false);
	});

	it("rejects null energy", () => {
		expect(
			mealSnapshotAllowsIntake({
				...usable,
				perServing: { ...usable.perServing, energyKcal: null as never },
			}),
		).toBe(false);
	});
});

describe("authoritative operation day totals", () => {
	it("keeps a 50-day atomic result update below D1's bind ceiling", async () => {
		const { drizzle } = await import("drizzle-orm/d1");
		const { nutritionOperation } = await import("~/db/schema");
		const fakeDb = {
			prepare() {
				return { bind: () => ({}) };
			},
		};
		const dates = Array.from(
			{ length: MAX_NUTRITION_OPERATION_ITEMS },
			(_, index) =>
				new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10),
		);
		const d1 = drizzle(fakeDb as unknown as D1Database);
		const statement = d1
			.update(nutritionOperation)
			.set({
				status: "completed",
				resultJson: buildNutritionOperationResultJson(
					principal,
					dates,
					"2026-08-09T12:00:00.000Z",
				),
			})
			.toSQL();

		expect(statement.sql).toContain("json_group_array");
		expect(statement.sql).toContain("voided_at");
		expect(statement.params.length).toBeLessThanOrEqual(D1_MAX_BOUND_PARAMS);
	});

	it("executes the atomic JSON aggregate with zero-fill and null-safe fiber", async () => {
		const { DatabaseSync } = await import("node:sqlite");
		const { drizzle } = await import("drizzle-orm/d1");
		const { nutritionOperation } = await import("~/db/schema");
		const fakeDb = {
			prepare() {
				return { bind: () => ({}) };
			},
		};
		const d1 = drizzle(fakeDb as unknown as D1Database);
		const statement = d1
			.update(nutritionOperation)
			.set({
				status: "completed",
				resultJson: buildNutritionOperationResultJson(
					principal,
					["2026-08-09", "2026-08-10"],
					"2026-08-09T12:00:00.000Z",
				),
			})
			.toSQL();

		const sqlite = new DatabaseSync(":memory:");
		sqlite.exec(`
			create table nutrition_operation (status text, result_json text);
			insert into nutrition_operation values ('in_progress', null);
			create table nutrition_intake (
				id text,
				user_id text,
				organization_id text,
				manifest_date text,
				energy_kcal real,
				protein_g real,
				carbs_g real,
				fat_g real,
				fiber_g real,
				nutrients_json text,
				coverage real,
				voided_at integer
			);
			insert into nutrition_intake values
				('i1', 'user-1', 'org-1', '2026-08-09', 500, 20, 60, 15, null, '{"fiberG":8}', 0.9, null),
				('i2', 'other-user', 'org-1', '2026-08-09', 999, 99, 99, 99, 99, null, 1, null);
		`);
		sqlite
			.prepare(statement.sql)
			.run(...(statement.params as import("node:sqlite").SQLInputValue[]));
		const row = sqlite
			.prepare("select result_json as resultJson from nutrition_operation")
			.get() as { resultJson: string };
		const result = JSON.parse(row.resultJson) as {
			dayTotals: Array<{
				date: string;
				energyKcal: number;
				fiberG: number | null;
				entryCount: number;
			}>;
		};
		expect(result.dayTotals).toEqual([
			expect.objectContaining({
				date: "2026-08-09",
				energyKcal: 500,
				fiberG: 8,
				entryCount: 1,
			}),
			expect.objectContaining({
				date: "2026-08-10",
				energyKcal: 0,
				fiberG: null,
				entryCount: 0,
			}),
		]);
		sqlite.close();
	});
});

describe("nutrition operation boundary validation", () => {
	it("rejects missing canonical write scope before touching storage", async () => {
		await expect(
			logManifestIntakes(
				env,
				{ ...principal, scopes: ["nutrition:read"] },
				flags,
				{
					operationKey: "11111111-1111-4111-8111-111111111111",
					planId: "plan-1",
					items: [
						{
							entryId: "entry-1",
							servings: 1,
							idempotencyKey: "22222222-2222-4222-8222-222222222222",
						},
					],
				},
			),
		).rejects.toBeInstanceOf(NutritionScopeError);
	});

	it("rejects duplicate entry ids before feature or database access", async () => {
		await expect(
			logManifestIntakes(env, principal, flags, {
				operationKey: "11111111-1111-4111-8111-111111111111",
				planId: "plan-1",
				items: [
					{
						entryId: "entry-1",
						servings: 1,
						idempotencyKey: "22222222-2222-4222-8222-222222222222",
					},
					{
						entryId: "entry-1",
						servings: 2,
						idempotencyKey: "33333333-3333-4333-8333-333333333333",
					},
				],
			}),
		).rejects.toBeInstanceOf(NutritionOperationValidationError);
	});

	it("rejects operations above the 50-item cap", async () => {
		const items = Array.from(
			{ length: MAX_NUTRITION_OPERATION_ITEMS + 1 },
			(_, index) => ({
				entryId: `entry-${index}`,
				servings: 1,
				idempotencyKey: crypto.randomUUID(),
			}),
		);
		await expect(
			logManifestIntakes(env, principal, flags, {
				operationKey: "11111111-1111-4111-8111-111111111111",
				planId: "plan-1",
				items,
			}),
		).rejects.toBeInstanceOf(NutritionOperationValidationError);
	});
});
