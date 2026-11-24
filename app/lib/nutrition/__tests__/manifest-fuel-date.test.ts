import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSqliteD1 } from "~/test/helpers/sqlite-d1";

vi.mock("~/lib/feature-flags/assert-enabled.server", () => ({
	assertFeatureEnabled: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("~/lib/feature-flags/flags.server", () => ({
	isFeatureEnabled: vi.fn(
		async (_env: unknown, flag: string) =>
			flag === "nutrition-fast-log" || flag === "nutrition-fuel-page",
	),
}));

vi.mock("~/lib/nutrition/consent.server", () => ({
	assertActiveNutritionConsent: vi.fn().mockResolvedValue({
		id: "consent-1",
		grantedAt: new Date("2026-08-01T00:00:00.000Z"),
		statement: { policyVersion: "nutrition-consent-v1" },
	}),
}));

import { readFuelUsed } from "~/lib/nutrition/fuel-cap.server";
import { fuelDateForInstant } from "~/lib/nutrition/fuel-date";
import { FuelDailyLimitError } from "~/lib/nutrition/fuel-errors";
import {
	logManifestIntakes,
	NutritionOperationValidationError,
	resolveManifestFuelDate,
} from "~/lib/nutrition/service.server";

type Sqlite = ReturnType<typeof createSqliteD1>["sqlite"];

const databases: Sqlite[] = [];
const CLOCK = new Date("2026-11-24T00:30:00.000Z");

const principal = {
	userId: "user-1",
	organizationId: "org-1",
	surface: "web" as const,
	authMethod: "session",
	scopes: ["nutrition:read", "nutrition:write"],
	requestId: "request-1",
};
const flags = {};

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(CLOCK);
});

afterEach(() => {
	vi.useRealTimers();
	for (const database of databases.splice(0)) database.close();
});

function setup() {
	const { database, sqlite } = createSqliteD1();
	databases.push(sqlite);
	const nutrition = JSON.stringify({
		source: "usda",
		confidence: 1,
		verified: true,
		coverage: 1,
		attributions: [
			{
				ingredientIndex: 0,
				ingredientName: "Fixture meal",
				fdcId: 1,
				source: "usda",
				grams: 100,
				contribution: {
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
			},
		],
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
		create table organization (
			id text primary key,
			name text not null
		);
		create table meal_plan (
			id text primary key,
			organization_id text not null
		);
		create table meal (
			id text primary key,
			organization_id text not null,
			name text not null default 'Meal',
			servings integer not null default 1,
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
			fuel_date text,
			id text primary key,
			organization_id text,
			user_id text not null,
			plan_id text,
			entry_id text,
			meal_id text,
			organization_name_snapshot text,
			meal_name_snapshot text,
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
			notes text,
			logged_amount real,
			logged_unit text,
			health_sync_id text,
			health_sync_version integer,
			composition_source text,
			composition_confirmed_at integer,
			fdc_id text,
			barcode text,
			saved_food_id text,
			tag_names text,
			created_at integer not null
		);
		create unique index nutrition_intake_user_idempotency_uidx
			on nutrition_intake(user_id, idempotency_key)
			where idempotency_key is not null;
		create unique index nutrition_intake_user_org_entry_active_uidx
			on nutrition_intake(user_id, organization_id, entry_id)
			where entry_id is not null and organization_id is not null and voided_at is null;
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
		create table user (
			id text primary key,
			tier text,
			tier_expires_at integer,
			settings text
		);
		create table nutrition_fuel_day (
			user_id text not null,
			fuel_date text not null,
			used integer not null default 0,
			primary key (user_id, fuel_date)
		);
		insert into organization values ('org-1', 'Test Kitchen');
		insert into meal_plan values ('plan-1', 'org-1');
		insert into user (id, tier, tier_expires_at, settings)
		values ('user-1', 'free', null, '{"fuelTimeZone":"Europe/Dublin"}');
		insert into meal (
			id, organization_id, name, nutrition,
			nutrition_revision, nutrition_computed_revision, nutrition_status
		) values (
			'meal-1', 'org-1', 'Fixture meal', '${nutrition}', 0, 0, 'current'
		);
	`);
	return {
		env: { DB: database, RATION_KV: {} as KVNamespace } as Env,
		sqlite,
	};
}

function seedEntry(sqlite: Sqlite, id: string, date: string) {
	sqlite
		.prepare(
			`insert into meal_plan_entry
			 (id, plan_id, meal_id, date, slot_type, cooked_at, consumed_at)
			 values (?, 'plan-1', 'meal-1', ?, 'dinner', 1786291200, null)`,
		)
		.run(id, date);
}

function storedFuelDate(sqlite: Sqlite, intakeId: string) {
	return (
		sqlite
			.prepare(
				"select fuel_date as fuelDate from nutrition_intake where id = ?",
			)
			.get(intakeId) as { fuelDate: string }
	).fuelDate;
}

let keyCount = 0;
function nextKey() {
	keyCount += 1;
	return `aaaaaaaa-aaaa-4aaa-8aaa-${keyCount.toString(16).padStart(12, "0")}`;
}

async function logLine(
	env: Env,
	entryId: string,
	options: { fuelDate?: string; zone?: string; servings?: number } = {},
) {
	const key = nextKey();
	return logManifestIntakes(env, principal, flags, {
		operationKey: key,
		planId: "plan-1",
		fuelTimeZone: options.zone ?? "Europe/Dublin",
		...(options.fuelDate ? { fuelDate: options.fuelDate } : {}),
		items: [
			{
				entryId,
				servings: options.servings ?? 1,
				idempotencyKey: key,
			},
		],
	});
}

describe("resolveManifestFuelDate", () => {
	it("uses the line when the client omits the day", () => {
		expect(resolveManifestFuelDate("2026-11-20")).toBe("2026-11-20");
		expect(resolveManifestFuelDate("2026-11-20", null)).toBe("2026-11-20");
	});

	it("accepts that same day, including a future day", () => {
		expect(resolveManifestFuelDate("2026-11-24", "2026-11-24")).toBe(
			"2026-11-24",
		);
		expect(resolveManifestFuelDate("2027-06-01", "2027-06-01")).toBe(
			"2027-06-01",
		);
	});

	it("rejects a different day and a day that is not real", () => {
		expect(() =>
			resolveManifestFuelDate("2026-11-20", "2026-11-24"),
		).toThrow(NutritionOperationValidationError);
		expect(() =>
			resolveManifestFuelDate("2026-11-20", "2026-02-31"),
		).toThrow(NutritionOperationValidationError);
	});
});

describe("Manifest plate-up Fuel day", () => {
	const pastA = "11111111-1111-4111-8111-111111111111";
	const pastB = "22222222-2222-4222-8222-222222222222";
	const pastC = "33333333-3333-4333-8333-333333333333";
	const pastD = "44444444-4444-4444-8444-444444444444";
	const today = "55555555-5555-4555-8555-555555555555";
	const future = "66666666-6666-4666-8666-666666666666";

	beforeEach(() => {
		keyCount = 0;
	});

	it("stores a past Manifest day while the clock is on a later day", async () => {
		const { env, sqlite } = setup();
		seedEntry(sqlite, pastA, "2026-11-20");
		const result = await logLine(env, pastA, {
			fuelDate: "2026-11-20",
			zone: "Asia/Tokyo",
		});
		const intake = result.items[0]?.intake;
		expect(intake).toBeDefined();
		expect(storedFuelDate(sqlite, intake?.id ?? "")).toBe("2026-11-20");
		expect(intake?.manifestDate).toBe("2026-11-20");
		expect(
			fuelDateForInstant(intake?.occurredAt ?? new Date(0), "Asia/Tokyo"),
		).toBe("2026-11-20");
		expect(await readFuelUsed(env.DB, "user-1", "2026-11-20")).toBe(1);
		expect(await readFuelUsed(env.DB, "user-1", "2026-11-24")).toBe(0);
	});

	it("keeps the line on November 20 when the device is still on November 23", async () => {
		const { env, sqlite } = setup();
		seedEntry(sqlite, pastB, "2026-11-20");
		const result = await logLine(env, pastB, {
			fuelDate: "2026-11-20",
			zone: "America/Los_Angeles",
		});
		const intake = result.items[0]?.intake;
		expect(storedFuelDate(sqlite, intake?.id ?? "")).toBe("2026-11-20");
		expect(
			fuelDateForInstant(
				intake?.occurredAt ?? new Date(0),
				"America/Los_Angeles",
			),
		).toBe("2026-11-20");
		expect(fuelDateForInstant(CLOCK, "America/Los_Angeles")).toBe("2026-11-23");
	});

	it("uses the line when the client omits the day, and today still logs on today", async () => {
		const { env, sqlite } = setup();
		seedEntry(sqlite, pastA, "2026-11-20");
		seedEntry(sqlite, today, "2026-11-24");
		const past = await logLine(env, pastA, { zone: "Europe/Dublin" });
		const current = await logLine(env, today, {
			fuelDate: "2026-11-24",
			zone: "Europe/Dublin",
		});
		expect(storedFuelDate(sqlite, past.items[0]?.intake.id ?? "")).toBe(
			"2026-11-20",
		);
		expect(storedFuelDate(sqlite, current.items[0]?.intake.id ?? "")).toBe(
			"2026-11-24",
		);
		expect(fuelDateForInstant(CLOCK, "Europe/Dublin")).toBe("2026-11-24");
	});

	it("counts the free 3-log cap on the Manifest day", async () => {
		const { env, sqlite } = setup();
		seedEntry(sqlite, pastA, "2026-11-20");
		seedEntry(sqlite, pastB, "2026-11-20");
		seedEntry(sqlite, pastC, "2026-11-20");
		seedEntry(sqlite, pastD, "2026-11-20");
		seedEntry(sqlite, today, "2026-11-24");
		await logLine(env, pastA, { fuelDate: "2026-11-20" });
		await logLine(env, pastB, { fuelDate: "2026-11-20" });
		await logLine(env, pastC, { fuelDate: "2026-11-20" });
		await expect(logLine(env, pastD, { fuelDate: "2026-11-20" })).rejects.toMatchObject(
			{ localDate: "2026-11-20" },
		);
		await expect(
			logLine(env, pastD, { fuelDate: "2026-11-20" }),
		).rejects.toBeInstanceOf(FuelDailyLimitError);
		expect(await readFuelUsed(env.DB, "user-1", "2026-11-20")).toBe(3);
		const current = await logLine(env, today, { fuelDate: "2026-11-24" });
		expect(storedFuelDate(sqlite, current.items[0]?.intake.id ?? "")).toBe(
			"2026-11-24",
		);
		expect(await readFuelUsed(env.DB, "user-1", "2026-11-24")).toBe(1);
		expect(await readFuelUsed(env.DB, "user-1", "2026-11-20")).toBe(3);
	});

	it("allows a future Manifest day and rejects a day that is not the line", async () => {
		const { env, sqlite } = setup();
		seedEntry(sqlite, future, "2027-06-01");
		seedEntry(sqlite, pastA, "2026-11-20");
		const logged = await logLine(env, future, { fuelDate: "2027-06-01" });
		expect(storedFuelDate(sqlite, logged.items[0]?.intake.id ?? "")).toBe(
			"2027-06-01",
		);
		expect(await readFuelUsed(env.DB, "user-1", "2027-06-01")).toBe(1);
		expect(await readFuelUsed(env.DB, "user-1", "2026-11-24")).toBe(0);
		await expect(
			logLine(env, pastA, { fuelDate: "2026-11-24" }),
		).rejects.toBeInstanceOf(NutritionOperationValidationError);
		expect(await readFuelUsed(env.DB, "user-1", "2026-11-24")).toBe(0);
		expect(await readFuelUsed(env.DB, "user-1", "2026-11-20")).toBe(0);
	});

	it("does not move a legacy row onto the Manifest day when the serving is edited", async () => {
		const { env, sqlite } = setup();
		seedEntry(sqlite, pastA, "2026-11-20");
		seedEntry(sqlite, today, "2026-11-24");
		const past = await logLine(env, pastA, { fuelDate: "2026-11-20" });
		const current = await logLine(env, today, { fuelDate: "2026-11-24" });
		const pastId = past.items[0]?.intake.id ?? "";
		const stamp = sqlite
			.prepare("select occurred_at as at from nutrition_intake where id = ?")
			.get(current.items[0]?.intake.id ?? "") as { at: number };
		sqlite
			.prepare(
				"update nutrition_intake set fuel_date = '2026-11-24', occurred_at = ? where id = ?",
			)
			.run(stamp.at, pastId);
		const edited = await logLine(env, pastA, {
			fuelDate: "2026-11-20",
			servings: 2,
		});
		expect(storedFuelDate(sqlite, edited.items[0]?.intake.id ?? "")).toBe(
			"2026-11-24",
		);
		expect(edited.items[0]?.intake.manifestDate).toBe("2026-11-20");
	});
});
