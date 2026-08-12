import { describe, expect, it } from "vitest";
import { createSqliteD1 } from "~/test/helpers/sqlite-d1";
import { getNutritionSummary } from "../persist.server";

describe("getNutritionSummary cross-org diary", () => {
	it("sums intakes across organizations when crossOrgDiary is true", async () => {
		const { database, sqlite } = createSqliteD1();
		sqlite.exec(`
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
			create table nutrition_intake (
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
				created_at integer not null
			);
			insert into nutrition_intake (
				id, organization_id, user_id, manifest_date, servings,
				energy_kcal, protein_g, carbs_g, fat_g, coverage, source, confidence,
				verified, occurred_at, created_at
			) values
				('i1', 'org-1', 'user-1', '2026-08-10', 1, 500, 20, 60, 15, 1, 'meal', 1, 1, unixepoch(), unixepoch()),
				('i2', 'org-2', 'user-1', '2026-08-10', 1, 300, 10, 30, 5, 1, 'meal', 1, 1, unixepoch(), unixepoch());
		`);

		const orgScoped = await getNutritionSummary(
			database,
			"user-1",
			"org-1",
			"2026-08-10",
			"2026-08-10",
		);
		expect(orgScoped.totals.energyKcal).toBe(500);

		const crossOrg = await getNutritionSummary(
			database,
			"user-1",
			"org-1",
			"2026-08-10",
			"2026-08-10",
			{ crossOrgDiary: true },
		);
		expect(crossOrg.totals.energyKcal).toBe(800);
		expect(crossOrg.days[0]?.entryCount).toBe(2);

		sqlite.close();
	});

	it("retains intake macros and snapshots when organization is deleted (SET NULL)", () => {
		const { sqlite } = createSqliteD1();
		sqlite.exec(`
			PRAGMA foreign_keys = ON;
			create table organization (
				id text primary key,
				name text not null
			);
			create table nutrition_intake (
				id text primary key,
				organization_id text references organization(id) on delete set null,
				user_id text not null,
				organization_name_snapshot text,
				meal_name_snapshot text,
				manifest_date text not null,
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
				notes text,
				voided_at integer,
				created_at integer not null
			);
			insert into organization values ('org-shared', 'Shared Home');
			insert into nutrition_intake (
				id, organization_id, user_id, organization_name_snapshot, meal_name_snapshot,
				manifest_date, servings, energy_kcal, protein_g, carbs_g, fat_g,
				coverage, source, confidence, verified, occurred_at, notes, created_at
			) values (
				'intake-1', 'org-shared', 'user-1', 'Shared Home', 'Pasta',
				'2026-08-10', 1, 640, 28, 70, 18,
				1, 'meal', 1, 1, unixepoch(), 'leftovers', unixepoch()
			);
			delete from organization where id = 'org-shared';
		`);

		const row = sqlite
			.prepare(
				`select organization_id, organization_name_snapshot, meal_name_snapshot,
					energy_kcal, notes from nutrition_intake where id = 'intake-1'`,
			)
			.get() as {
			organization_id: string | null;
			organization_name_snapshot: string;
			meal_name_snapshot: string;
			energy_kcal: number;
			notes: string;
		};

		expect(row.organization_id).toBeNull();
		expect(row.organization_name_snapshot).toBe("Shared Home");
		expect(row.meal_name_snapshot).toBe("Pasta");
		expect(row.energy_kcal).toBe(640);
		expect(row.notes).toBe("leftovers");
		sqlite.close();
	});
});
