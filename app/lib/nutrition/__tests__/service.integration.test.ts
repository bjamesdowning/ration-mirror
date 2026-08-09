import { afterEach, describe, expect, it, vi } from "vitest";
import { createSqliteD1 } from "~/test/helpers/sqlite-d1";

vi.mock("~/lib/feature-flags/assert-enabled.server", () => ({
	assertFeatureEnabled: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("~/lib/feature-flags/flags.server", () => ({
	isFeatureEnabled: vi.fn().mockResolvedValue(true),
}));

vi.mock("~/lib/nutrition/consent.server", () => ({
	assertActiveNutritionConsent: vi.fn().mockResolvedValue({
		id: "consent-1",
		grantedAt: new Date("2026-08-01T00:00:00.000Z"),
		statement: { policyVersion: "nutrition-consent-v1" },
	}),
}));

import {
	clearGoal,
	clearManifestIntakes,
	logManifestIntakes,
	NutritionItemConflictError,
	NutritionOperationConflictError,
	setGoal,
	undoIntake,
} from "../service.server";

const databases: Array<ReturnType<typeof createSqliteD1>["sqlite"]> = [];

afterEach(() => {
	for (const database of databases.splice(0)) database.close();
});

function setup() {
	const { database, sqlite } = createSqliteD1();
	databases.push(sqlite);
	sqlite.exec(`
		create table meal_plan (
			id text primary key,
			organization_id text not null
		);
		create table meal (
			id text primary key,
			organization_id text not null,
			nutrition text,
			nutrition_revision integer not null default 0,
			nutrition_computed_revision integer not null default 0,
			nutrition_status text not null default 'current',
			nutrition_updated_at integer
		);
		create table meal_plan_entry (
			id text primary key,
			plan_id text not null,
			meal_id text not null,
			date text not null,
			slot_type text,
			cooked_at integer,
			consumed_at integer
		);
		create table nutrition_intake (
			id text primary key,
			organization_id text not null,
			user_id text not null,
			plan_id text,
			entry_id text,
			meal_id text,
			manifest_date text not null,
			slot_type text,
			servings real not null,
			energy_kcal real not null,
			protein_g real not null,
			carbs_g real not null,
			fat_g real not null,
			coverage real not null,
			source text not null,
			confidence real not null,
			verified integer not null default 0,
			occurred_at integer not null,
			kitchen_event_id text,
			schema_version integer not null default 1,
			nutrients_json text,
			coverage_json text,
			fiber_g real,
			consent_id text,
			idempotency_key text,
			operation_id text,
			replaces_intake_id text,
			void_operation_id text,
			voided_at integer,
			voided_by_user_id text,
			created_at integer not null
		);
		create unique index nutrition_intake_user_idempotency_uidx
			on nutrition_intake(user_id, idempotency_key)
			where idempotency_key is not null;
		create unique index nutrition_intake_user_org_entry_active_uidx
			on nutrition_intake(user_id, organization_id, entry_id)
			where entry_id is not null and voided_at is null;
		create table nutrition_operation (
			id text primary key,
			user_id text not null,
			organization_id text not null,
			operation_key text not null,
			request_hash text not null,
			operation_type text not null,
			status text not null,
			item_count integer not null,
			result_json text,
			created_at integer not null,
			completed_at integer,
			undone_at integer,
			unique(user_id, operation_key)
		);
		create table nutrition_access_audit (
			id text primary key,
			event_version integer not null default 1,
			user_id text,
			organization_id text,
			surface text not null,
			auth_method text not null,
			credential_id text,
			client_id text,
			event_type text not null,
			required_scope text,
			consent_purpose text,
			consent_policy_version text,
			outcome text not null,
			error_code text,
			replayed integer not null default 0,
			item_count_bucket text,
			date_range_bucket text,
			request_id text not null,
			operation_id text,
			duration_bucket text,
			occurred_at integer not null default (unixepoch())
		);
		create table nutrition_goal (
			id text primary key,
			user_id text not null,
			daily_energy_kcal real,
			protein_g real,
			carbs_g real,
			fat_g real,
			fiber_g real,
			effective_from text not null,
			effective_to text,
			consent_at integer not null,
			consent_id text,
			created_at integer not null
		);
		create unique index nutrition_goal_user_open_uidx
			on nutrition_goal(user_id)
			where effective_to is null;
		insert into meal_plan values ('plan-1', 'org-1');
	`);
	const nutrition = JSON.stringify({
		source: "usda",
		confidence: 1,
		verified: true,
		coverage: 1,
		per100g: null,
		perServing: {
			energyKcal: 500,
			proteinG: 20,
			fatG: 15,
			carbG: 60,
			fiberG: 8,
			sugarG: null,
			satFatG: null,
			sodiumMg: null,
			saltG: null,
		},
		fdcId: 1,
		description: "Fixture meal",
	}).replaceAll("'", "''");
	sqlite.exec(`
		insert into meal (id, organization_id, nutrition, nutrition_revision, nutrition_computed_revision, nutrition_status)
		values ('meal-1', 'org-1', '${nutrition}', 0, 0, 'current');
		insert into meal_plan_entry values
			('11111111-1111-4111-8111-111111111111', 'plan-1', 'meal-1', '2026-08-09', 'dinner', 1786291200, null),
			('22222222-2222-4222-8222-222222222222', 'plan-1', 'meal-1', '2026-08-09', 'dinner', 1786291200, null);
	`);
	return {
		env: {
			DB: database,
			RATION_KV: {} as KVNamespace,
		} as Env,
		sqlite,
	};
}

const principal = {
	userId: "user-1",
	organizationId: "org-1",
	surface: "web" as const,
	authMethod: "session",
	scopes: ["nutrition:read", "nutrition:write"],
	requestId: "request-1",
};
const flags = {};
const firstItem = {
	entryId: "11111111-1111-4111-8111-111111111111",
	servings: 1,
	idempotencyKey: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
};

describe("canonical nutrition service with transactional SQLite", () => {
	it("replays the same operation and rejects operation/item key conflicts", async () => {
		const { env, sqlite } = setup();
		const operationKey = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
		const first = await logManifestIntakes(env, principal, flags, {
			operationKey,
			planId: "plan-1",
			items: [firstItem],
		});
		const replay = await logManifestIntakes(env, principal, flags, {
			operationKey,
			planId: "plan-1",
			items: [firstItem],
		});

		expect(replay.operationId).toBe(first.operationId);
		expect(replay.items[0]?.intake.id).toBe(first.items[0]?.intake.id);
		expect(replay.dayTotals).toEqual(first.dayTotals);
		expect(replay.replayed).toBe(true);
		expect(
			sqlite.prepare("select count(*) count from nutrition_intake").get() as {
				count: number;
			},
		).toEqual({ count: 1 });

		await expect(
			logManifestIntakes(env, principal, flags, {
				operationKey,
				planId: "plan-1",
				items: [{ ...firstItem, servings: 2 }],
			}),
		).rejects.toBeInstanceOf(NutritionOperationConflictError);

		await expect(
			logManifestIntakes(env, principal, flags, {
				operationKey: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
				planId: "plan-1",
				items: [
					{
						...firstItem,
						entryId: "22222222-2222-4222-8222-222222222222",
					},
				],
			}),
		).rejects.toBeInstanceOf(NutritionItemConflictError);
	});

	it("atomically replaces active intake and preserves commit-time totals on replay", async () => {
		const { env, sqlite } = setup();
		const first = await logManifestIntakes(env, principal, flags, {
			operationKey: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
			planId: "plan-1",
			items: [firstItem],
		});
		const edit = await logManifestIntakes(env, principal, flags, {
			operationKey: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
			planId: "plan-1",
			items: [
				{
					...firstItem,
					servings: 2,
					idempotencyKey: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
				},
			],
		});
		const firstReplay = await logManifestIntakes(env, principal, flags, {
			operationKey: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
			planId: "plan-1",
			items: [firstItem],
		});

		expect(first.dayTotals[0]?.energyKcal).toBe(500);
		expect(edit.dayTotals[0]?.energyKcal).toBe(1000);
		expect(firstReplay.dayTotals).toEqual(first.dayTotals);
		expect(edit.items[0]?.replacedIntakeId).toBe(first.items[0]?.intake.id);
		const active = sqlite
			.prepare(
				"select id, replaces_intake_id replacesId from nutrition_intake where voided_at is null",
			)
			.all() as Array<{ id: string; replacesId: string | null }>;
		expect(active).toEqual([
			{
				id: edit.items[0]?.intake.id,
				replacesId: first.items[0]?.intake.id,
			},
		]);
		await undoIntake(env, principal, flags, edit.operationId);
		const replayAfterUndo = await logManifestIntakes(env, principal, flags, {
			operationKey: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
			planId: "plan-1",
			items: [
				{
					...firstItem,
					servings: 2,
					idempotencyKey: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
				},
			],
		});
		expect(replayAfterUndo.undoExpiresAt).toBeNull();
		const activeAfterUndo = sqlite
			.prepare("select id from nutrition_intake where voided_at is null")
			.all() as Array<{ id: string }>;
		expect(activeAfterUndo).toEqual([{ id: first.items[0]?.intake.id }]);
	});

	it("rolls back the entire batch when the final audit write fails", async () => {
		const { env, sqlite } = setup();
		sqlite.exec("drop table nutrition_access_audit");

		await expect(
			logManifestIntakes(env, principal, flags, {
				operationKey: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
				planId: "plan-1",
				items: [firstItem],
			}),
		).rejects.toMatchObject({ code: "nutrition_persistence_invariant" });
		expect(
			sqlite.prepare("select count(*) count from nutrition_intake").get() as {
				count: number;
			},
		).toEqual({ count: 0 });
		expect(
			sqlite
				.prepare("select count(*) count from nutrition_operation")
				.get() as { count: number },
		).toEqual({ count: 0 });
	});

	it("retries a raced active-row replacement with the same operation and intake IDs", async () => {
		const { env, sqlite } = setup();
		const first = await logManifestIntakes(env, principal, flags, {
			operationKey: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
			planId: "plan-1",
			items: [firstItem],
		});
		const database = env.DB;
		let injectedRace = false;
		env.DB = {
			prepare: database.prepare.bind(database),
			batch: async (statements) => {
				if (!injectedRace) {
					injectedRace = true;
					sqlite
						.prepare(
							`update nutrition_intake
							 set voided_at = unixepoch(), voided_by_user_id = 'user-1'
							 where id = ?`,
						)
						.run(first.items[0]?.intake.id);
					sqlite
						.prepare(
							`insert into nutrition_intake
							 select 'competing-intake', organization_id, user_id, plan_id,
							 entry_id, meal_id, manifest_date, slot_type, 1.5, energy_kcal,
							 protein_g, carbs_g, fat_g, coverage, source, confidence, verified,
							 occurred_at, kitchen_event_id, schema_version, nutrients_json,
							 coverage_json, fiber_g, consent_id, '99999999-9999-4999-8999-999999999999',
							 null, id, null, null, null, created_at
							 from nutrition_intake where id = ?`,
						)
						.run(first.items[0]?.intake.id);
					throw new Error(
						"UNIQUE constraint failed: nutrition_intake_user_org_entry_active_uidx",
					);
				}
				return database.batch(statements);
			},
		} as D1Database;

		const result = await logManifestIntakes(env, principal, flags, {
			operationKey: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
			planId: "plan-1",
			items: [
				{
					...firstItem,
					servings: 2,
					idempotencyKey: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
				},
			],
		});
		expect(result.items[0]?.replacedIntakeId).toBe("competing-intake");
		expect(
			sqlite
				.prepare(
					"select count(*) count from nutrition_intake where voided_at is null",
				)
				.get(),
		).toEqual({ count: 1 });
	});

	it("commits a 50-item operation atomically under D1 statement limits", async () => {
		const { env, sqlite } = setup();
		const items = Array.from({ length: 50 }, (_, index) => {
			const suffix = index.toString(16).padStart(12, "0");
			const entryId = `10000000-0000-4000-8000-${suffix}`;
			sqlite
				.prepare(
					`insert into meal_plan_entry values
					 (?, 'plan-1', 'meal-1', '2026-08-09', 'dinner', 1786291200, null)`,
				)
				.run(entryId);
			return {
				entryId,
				servings: 1,
				idempotencyKey: `20000000-0000-4000-8000-${suffix}`,
			};
		});
		const result = await logManifestIntakes(env, principal, flags, {
			operationKey: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
			planId: "plan-1",
			items,
		});
		expect(result.items).toHaveLength(50);
		expect(
			sqlite.prepare("select count(*) count from nutrition_intake").get(),
		).toEqual({ count: 50 });
		expect(result.dayTotals[0]?.entryCount).toBe(50);
	});

	it("clears idempotently and restores only rows from the authorized operation", async () => {
		const { env, sqlite } = setup();
		const logged = await logManifestIntakes(env, principal, flags, {
			operationKey: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
			planId: "plan-1",
			items: [firstItem],
		});
		const cleared = await clearManifestIntakes(env, principal, flags, {
			operationKey: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
			planId: "plan-1",
			entryIds: [firstItem.entryId],
		});
		const replay = await clearManifestIntakes(env, principal, flags, {
			operationKey: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
			planId: "plan-1",
			entryIds: [firstItem.entryId],
		});

		expect(cleared.dayTotals[0]?.entryCount).toBe(0);
		expect(replay.dayTotals).toEqual(cleared.dayTotals);
		const undoResult = await undoIntake(
			env,
			principal,
			flags,
			cleared.operationId,
		);
		expect(undoResult.undone).toBe(true);
		await expect(
			undoIntake(env, principal, flags, cleared.operationId),
		).resolves.toMatchObject({ replayed: true, undone: true });
		const restored = sqlite
			.prepare(
				"select voided_at voidedAt, void_operation_id voidOperationId from nutrition_intake where id = ?",
			)
			.get(logged.items[0]?.intake.id) as {
			voidedAt: number | null;
			voidOperationId: string | null;
		};
		expect(restored).toEqual({ voidedAt: null, voidOperationId: null });
	});

	it("rejects durable intake undo after the five-second window", async () => {
		const { env, sqlite } = setup();
		const logged = await logManifestIntakes(env, principal, flags, {
			operationKey: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
			planId: "plan-1",
			items: [firstItem],
		});
		sqlite
			.prepare(
				"update nutrition_operation set completed_at = unixepoch() - 6 where id = ?",
			)
			.run(logged.operationId);
		await expect(
			undoIntake(env, principal, flags, logged.operationId),
		).rejects.toMatchObject({ code: "undo_conflict" });
	});

	it("rejects stale undo instead of resurrecting intake superseded by a newer write", async () => {
		const { env, sqlite } = setup();
		await logManifestIntakes(env, principal, flags, {
			operationKey: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
			planId: "plan-1",
			items: [firstItem],
		});
		const edit = await logManifestIntakes(env, principal, flags, {
			operationKey: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
			planId: "plan-1",
			items: [
				{
					...firstItem,
					servings: 2,
					idempotencyKey: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
				},
			],
		});
		const latest = await logManifestIntakes(env, principal, flags, {
			operationKey: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
			planId: "plan-1",
			items: [
				{
					...firstItem,
					servings: 3,
					idempotencyKey: "ffffffff-ffff-4fff-8fff-ffffffffffff",
				},
			],
		});

		await expect(
			undoIntake(env, principal, flags, edit.operationId),
		).rejects.toMatchObject({ code: "undo_conflict" });
		const active = sqlite
			.prepare("select id from nutrition_intake where voided_at is null")
			.get() as { id: string };
		expect(active.id).toBe(latest.items[0]?.intake.id);
	});

	it("versions goals atomically with stable set and clear replays", async () => {
		const { env, sqlite } = setup();
		const input = {
			operationKey: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
			dailyEnergyKcal: 2200,
			proteinG: 120,
			carbsG: null,
			fatG: null,
			fiberG: null,
			effectiveFrom: "2026-08-09",
		};
		const first = await setGoal(env, principal, flags, input);
		const replay = await setGoal(env, principal, flags, input);
		expect(replay).toEqual({ ...first, replayed: true });

		const replacement = await setGoal(env, principal, flags, {
			...input,
			operationKey: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
			dailyEnergyKcal: 2400,
		});
		const rows = sqlite
			.prepare(
				"select id, effective_to effectiveTo from nutrition_goal order by created_at, id",
			)
			.all() as Array<{ id: string; effectiveTo: string | null }>;
		expect(rows).toEqual(
			expect.arrayContaining([
				{ id: first.goal.id, effectiveTo: "2026-08-08" },
				{ id: replacement.goal.id, effectiveTo: null },
			]),
		);

		const clearInput = {
			operationKey: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
			asOfDate: "2026-08-09",
		};
		const cleared = await clearGoal(env, principal, flags, clearInput);
		const clearReplay = await clearGoal(env, principal, flags, clearInput);
		expect(clearReplay).toEqual({ ...cleared, replayed: true });
		expect(
			sqlite
				.prepare(
					"select effective_to effectiveTo from nutrition_goal where id = ?",
				)
				.get(replacement.goal.id),
		).toEqual({ effectiveTo: "2026-08-08" });
		const { getGoal } = await import("../service.server");
		expect(await getGoal(env, principal, flags, "2026-08-09")).toBeNull();
	});

	it("replays goal operations across organization switches", async () => {
		const { env } = setup();
		const input = {
			operationKey: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
			dailyEnergyKcal: 2200,
			proteinG: 120,
			carbsG: null,
			fatG: null,
			fiberG: null,
			effectiveFrom: "2026-08-09",
		};
		const first = await setGoal(env, principal, flags, input);
		const replay = await setGoal(
			env,
			{ ...principal, organizationId: "org-2" },
			flags,
			input,
		);
		expect(replay).toEqual({ ...first, replayed: true });
	});

	it("rejects cross-organization entry access before mutation", async () => {
		const { env, sqlite } = setup();
		await expect(
			logManifestIntakes(
				env,
				{ ...principal, organizationId: "org-2" },
				flags,
				{
					operationKey: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
					planId: "plan-1",
					items: [firstItem],
				},
			),
		).rejects.toMatchObject({ code: "not_found" });
		expect(
			sqlite.prepare("select count(*) count from nutrition_intake").get() as {
				count: number;
			},
		).toEqual({ count: 0 });
	});
});
