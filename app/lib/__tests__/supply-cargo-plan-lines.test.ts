import { drizzle } from "drizzle-orm/d1";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cargo, manifestCargoLine, mealPlan } from "~/db/schema";
import { kitchenTodayISO } from "~/lib/kitchen-time";
import {
	createSupplyListFromSelectedMeals,
	getSupplyList,
	reconcileSupplyAfterDock,
} from "~/lib/supply.server";
import { createMockEnv } from "~/test/helpers/mock-env";
import { createSqliteD1 } from "~/test/helpers/sqlite-d1";

const ORG = "org-cargo-lines";
const NOW = new Date("2026-11-12T15:00:00.000Z");

function schemaSql() {
	return `
		create table organization (
			id text primary key,
			name text not null,
			slug text,
			logo text,
			metadata text,
			created_at integer not null default 0,
			credits integer not null default 0
		);
		create table meal_plan (
			id text primary key,
			organization_id text not null,
			name text not null default 'Meal Plan',
			share_token text,
			share_expires_at integer,
			is_archived integer not null default 0,
			created_at integer not null default 0,
			updated_at integer not null default 0
		);
		create table meal_plan_entry (
			id text primary key,
			plan_id text not null,
			meal_id text not null,
			date text not null,
			slot_type text not null default 'dinner',
			order_index integer not null default 0,
			servings_override integer,
			notes text,
			consumed_at integer,
			cooked_at integer,
			cooked_by_user_id text,
			created_at integer not null default 0
		);
		create table manifest_cargo_line (
			id text primary key,
			plan_id text not null,
			cargo_id text not null,
			date text not null,
			slot_type text not null default 'dinner',
			order_index integer not null default 0,
			quantity real not null,
			unit text not null,
			notes text,
			cooked_at integer,
			cooked_by_user_id text,
			created_at integer not null default 0
		);
		create table manifest_supply_day (
			organization_id text not null,
			date text not null,
			excluded integer not null default 1,
			updated_at integer not null default 0
		);
		create table active_meal_selection (
			id text primary key,
			organization_id text not null,
			meal_id text not null,
			servings_override integer,
			created_at integer not null default 0
		);
		create table active_cargo_selection (
			id text primary key,
			organization_id text not null,
			cargo_id text not null,
			quantity_override real,
			created_at integer not null default 0
		);
		create table supply_snooze (
			id text primary key,
			organization_id text not null,
			normalized_name text not null,
			domain text not null default 'food',
			snoozed_until integer not null,
			created_at integer not null default 0
		);
		create table supply_list (
			id text primary key,
			organization_id text not null,
			name text not null default 'Shopping List',
			share_token text,
			share_expires_at integer,
			kind text not null default 'saved',
			archived_at integer,
			created_from text not null default 'manual',
			source_list_id text,
			source_reference text,
			store_profile_id text,
			revision integer not null default 0,
			quota_slot integer,
			created_at integer not null default 0,
			updated_at integer not null default 0
		);
		create table supply_item (
			id text primary key,
			list_id text not null,
			name text not null,
			quantity real not null default 1,
			unit text not null default 'unit',
			base_quantity real not null default 1,
			base_unit text not null default 'unit',
			domain text not null default 'food',
			is_purchased integer not null default 0,
			source_meal_id text,
			source_meal_ids text not null default '[]',
			source_origins text not null default '[]',
			source_cargo_id text,
			note text,
			category text,
			sort_order integer not null default 0,
			created_at integer not null default 0,
			updated_at integer not null default 0
		);
		create table cargo (
			id text primary key,
			organization_id text not null,
			name text not null,
			quantity real not null,
			unit text not null,
			base_quantity real not null default 1,
			base_unit text not null default 'unit',
			domain text not null default 'food',
			status text not null default 'stable',
			expires_at integer,
			nutrition text,
			created_at integer not null default 0,
			updated_at integer not null default 0
		);
	`;
}

function memoryKv(): KVNamespace {
	const store = new Map<string, string>();
	return {
		get: vi.fn(async (key: string) => store.get(key) ?? null),
		put: vi.fn(async (key: string, value: string) => {
			store.set(key, value);
		}),
		delete: vi.fn(async (key: string) => {
			store.delete(key);
		}),
	} as unknown as KVNamespace;
}

function envFor(db: D1Database) {
	return { ...createMockEnv(), DB: db, RATION_KV: memoryKv() };
}

function flagContext(on: boolean) {
	return {
		clientPlatform: "web",
		userId: "user-1",
		"testFlag:nutrition-fast-log": on,
		"testFlag:nutrition-fuel-page": on,
		"testFlag:plan-fuel-actions": on,
	};
}

function itemNames(
	list: { items: Array<{ name: string }> } | null | undefined,
) {
	return (list?.items ?? []).map((item) => item.name).sort();
}

describe("supply sync cargo plan lines", () => {
	let db: D1Database;
	let env: ReturnType<typeof envFor>;

	beforeEach(async () => {
		const sqlite = createSqliteD1();
		sqlite.sqlite.exec(schemaSql());
		db = sqlite.database;
		env = envFor(db);
		const d1 = drizzle(db);
		const today = kitchenTodayISO(null);
		const planId = "plan-1";
		const carrots = "cargo-carrots";
		const onions = "cargo-onions";
		const rice = "cargo-rice";
		await d1.insert(mealPlan).values({
			id: planId,
			organizationId: ORG,
			name: "Meal Plan",
			isArchived: false,
			createdAt: NOW,
			updatedAt: NOW,
		});
		await d1.insert(cargo).values([
			{
				id: carrots,
				organizationId: ORG,
				name: "Carrots",
				quantity: 2,
				unit: "unit",
				domain: "food",
				createdAt: NOW,
				updatedAt: NOW,
			},
			{
				id: onions,
				organizationId: ORG,
				name: "Onions",
				quantity: 1,
				unit: "unit",
				domain: "food",
				createdAt: NOW,
				updatedAt: NOW,
			},
			{
				id: rice,
				organizationId: ORG,
				name: "Rice",
				quantity: 1,
				unit: "unit",
				domain: "food",
				createdAt: NOW,
				updatedAt: NOW,
			},
		]);
		await d1.insert(manifestCargoLine).values([
			{
				id: "line-carrots",
				planId,
				cargoId: carrots,
				date: today,
				quantity: 2,
				unit: "unit",
				cookedAt: null,
				createdAt: NOW,
			},
			{
				id: "line-onions",
				planId,
				cargoId: onions,
				date: today,
				quantity: 1,
				unit: "unit",
				cookedAt: NOW,
				createdAt: NOW,
			},
			{
				id: "line-rice",
				planId,
				cargoId: rice,
				date: "2020-01-01",
				quantity: 1,
				unit: "unit",
				cookedAt: null,
				createdAt: NOW,
			},
		]);
	});

	it("omits cargo plan lines when the argument is left at its default", async () => {
		const result = await createSupplyListFromSelectedMeals(env, ORG);
		expect(itemNames(result.list)).toEqual([]);
	});

	it("omits cargo plan lines when the flag is off", async () => {
		const result = await createSupplyListFromSelectedMeals(
			env,
			ORG,
			undefined,
			undefined,
			"metric",
			"user-1",
			false,
		);
		expect(itemNames(result.list)).toEqual([]);
	});

	it("keeps the uncooked in-window cargo line when the flag is on", async () => {
		const result = await createSupplyListFromSelectedMeals(
			env,
			ORG,
			undefined,
			undefined,
			"metric",
			"user-1",
			true,
		);
		expect(itemNames(result.list)).toEqual(["Carrots"]);
	});

	it("drops those lines on the next flag-off rebuild", async () => {
		await createSupplyListFromSelectedMeals(
			env,
			ORG,
			undefined,
			undefined,
			"metric",
			"user-1",
			true,
		);
		const rebuilt = await createSupplyListFromSelectedMeals(
			env,
			ORG,
			undefined,
			undefined,
			"metric",
			"user-1",
			false,
		);
		expect(itemNames(rebuilt.list)).toEqual([]);
	});

	it("keeps the line after dock when plan-fuel-actions is on", async () => {
		await reconcileSupplyAfterDock(env, ORG, [], {
			flagContext: flagContext(true),
		});
		const list = await getSupplyList(db, ORG);
		expect(itemNames(list)).toEqual(["Carrots"]);
	});

	it("omits the line after dock when plan-fuel-actions is off", async () => {
		await createSupplyListFromSelectedMeals(
			env,
			ORG,
			undefined,
			undefined,
			"metric",
			"user-1",
			true,
		);
		await reconcileSupplyAfterDock(env, ORG, [], {
			flagContext: flagContext(false),
		});
		const list = await getSupplyList(db, ORG);
		expect(itemNames(list)).toEqual([]);
	});

	it("omits the line after dock when no flag context is passed", async () => {
		await createSupplyListFromSelectedMeals(
			env,
			ORG,
			undefined,
			undefined,
			"metric",
			"user-1",
			true,
		);
		await reconcileSupplyAfterDock(env, ORG, []);
		const list = await getSupplyList(db, ORG);
		expect(itemNames(list)).toEqual([]);
	});
});
