import { getTableColumns } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import { nutritionIntake, nutritionSavedFood } from "~/db/schema";
import { IOS_FEATURE_FLOOR } from "~/lib/feature-flags/flags.server";
import { createSqliteD1 } from "~/test/helpers/sqlite-d1";
import { copySavedFoodOntoWrite, savedFoodsVisibleTo } from "../saved-food";
import {
	deleteSavedFood,
	listSavedFoods,
	saveFood,
} from "../saved-food.server";

const yogurt = {
	id: "55555555-5555-4555-8555-555555555555",
	userId: "user-a",
	name: "Yogurt",
	energyKcal: 90,
	proteinG: 8,
	carbsG: 6,
	fatG: 3,
	fiberG: null,
	defaultAmount: 1,
	defaultUnit: "serving",
	barcode: null,
	fdcId: null,
};

describe("saved food tenancy", () => {
	it("has no organization column and cascades from the user", () => {
		expect(IOS_FEATURE_FLOOR).toBe("1.5.0");
		expect("organizationId" in getTableColumns(nutritionSavedFood)).toBe(false);
		const config = getTableConfig(nutritionSavedFood);
		expect(config.columns.map((column) => column.name)).not.toContain(
			"organization_id",
		);
		const userKey = config.foreignKeys.find((key) =>
			key.reference().columns.some((column) => column.name === "user_id"),
		);
		expect(userKey?.onDelete).toBe("cascade");
		const intakeKey = getTableConfig(nutritionIntake).foreignKeys.find((key) =>
			key.reference().columns.some((column) => column.name === "saved_food_id"),
		);
		expect(intakeKey?.onDelete).toBe("set null");
	});

	it("copies stored numbers and ignores a caller's substitutes", () => {
		const copied = copySavedFoodOntoWrite({
			...yogurt,
			energyKcal: 90,
		});
		expect(copied).toMatchObject({
			savedFoodId: yogurt.id,
			name: "Yogurt",
			amount: 1,
			unit: "serving",
			macros: { energyKcal: 90, proteinG: 8, carbsG: 6, fatG: 3 },
		});
		expect(copied.macros.energyKcal).not.toBe(999);
	});

	it("returns an empty read for another member", () => {
		expect(savedFoodsVisibleTo([yogurt], "user-b")).toEqual([]);
		expect(savedFoodsVisibleTo([yogurt], "user-a")).toEqual([yogurt]);
	});

	it("cascades with the user and does not void past intake on delete", async () => {
		const { database, sqlite } = createSqliteD1();
		sqlite.exec("pragma foreign_keys = on");
		sqlite.exec(`
			create table user (id text primary key);
			create table nutrition_saved_food (
				id text primary key,
				user_id text not null references user(id) on delete cascade,
				name text not null,
				energy_kcal real not null,
				protein_g real not null,
				carbs_g real not null,
				fat_g real not null,
				fiber_g real,
				default_amount real,
				default_unit text,
				barcode text,
				fdc_id text,
				created_at integer not null,
				updated_at integer not null
			);
			create table nutrition_intake (
				id text primary key,
				user_id text not null,
				energy_kcal real not null,
				voided_at integer,
				saved_food_id text references nutrition_saved_food(id) on delete set null
			);
		`);
		sqlite.exec(`
			insert into user (id) values ('user-a'), ('user-b');
			insert into nutrition_saved_food (
				id, user_id, name, energy_kcal, protein_g, carbs_g, fat_g,
				default_amount, default_unit, created_at, updated_at
			) values (
				'${yogurt.id}', 'user-a', 'Yogurt', 90, 8, 6, 3, 1, 'serving', 1, 1
			);
			insert into nutrition_intake (id, user_id, energy_kcal, voided_at, saved_food_id)
			values ('intake-1', 'user-a', 90, null, '${yogurt.id}');
		`);

		expect(await listSavedFoods(database, "user-b")).toEqual([]);
		expect(
			(await listSavedFoods(database, "user-a")).map((row) => row.id),
		).toEqual([yogurt.id]);

		await deleteSavedFood(database, "user-a", yogurt.id);
		const intake = sqlite
			.prepare(
				"select energy_kcal as kcal, voided_at as voidedAt, saved_food_id as savedFoodId from nutrition_intake",
			)
			.get() as {
			kcal: number;
			voidedAt: number | null;
			savedFoodId: string | null;
		};
		expect(intake).toEqual({ kcal: 90, voidedAt: null, savedFoodId: null });

		sqlite.exec(`
			insert into nutrition_saved_food (
				id, user_id, name, energy_kcal, protein_g, carbs_g, fat_g,
				created_at, updated_at
			) values ('66666666-6666-4666-8666-666666666666', 'user-a', 'Oats', 100, 4, 18, 2, 1, 1);
		`);
		sqlite.exec("delete from user where id = 'user-a'");
		expect(
			sqlite.prepare("select count(*) as n from nutrition_saved_food").get(),
		).toEqual({ n: 0 });
		expect(
			sqlite
				.prepare(
					"select energy_kcal as kcal, voided_at as voidedAt from nutrition_intake",
				)
				.get(),
		).toEqual({ kcal: 90, voidedAt: null });
	});

	it("updates custom macros without rewriting a copied intake row", async () => {
		const { database, sqlite } = createSqliteD1();
		sqlite.exec(`
			create table nutrition_saved_food (
				id text primary key,
				user_id text not null,
				name text not null,
				energy_kcal real not null,
				protein_g real not null,
				carbs_g real not null,
				fat_g real not null,
				fiber_g real,
				default_amount real,
				default_unit text,
				barcode text,
				fdc_id text,
				created_at integer not null,
				updated_at integer not null
			);
			create table nutrition_intake (
				id text primary key,
				energy_kcal real not null,
				saved_food_id text
			);
		`);
		const saved = await saveFood(database, "user-a", {
			name: "Yogurt",
			amount: 1,
			unit: "serving",
			macros: { energyKcal: 90, proteinG: 8, carbsG: 6, fatG: 3, fiberG: null },
		});
		sqlite
			.prepare(
				"insert into nutrition_intake (id, energy_kcal, saved_food_id) values (?, ?, ?)",
			)
			.run("intake-1", 90, saved.id);
		const edited = await saveFood(database, "user-a", {
			name: "Yogurt",
			amount: 1,
			unit: "serving",
			macros: {
				energyKcal: 110,
				proteinG: 9,
				carbsG: 7,
				fatG: 4,
				fiberG: null,
			},
		});
		expect(edited.id).toBe(saved.id);
		expect(edited.energyKcal).toBe(110);
		expect(
			sqlite.prepare("select energy_kcal as kcal from nutrition_intake").get(),
		).toEqual({ kcal: 90 });
	});
});
