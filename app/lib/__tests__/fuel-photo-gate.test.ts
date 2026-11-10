import { beforeEach, describe, expect, it, vi } from "vitest";
import { DiaryFoodNotFoundError } from "~/lib/nutrition/diary.server";
import { FuelDailyLimitError } from "~/lib/nutrition/fuel-errors";
import {
	confirmFuelPhoto,
	readFuelPhoto,
} from "~/lib/nutrition/fuel-photo.server";
import type { NutritionPrincipal } from "~/lib/nutrition/service.server";
import { createSqliteD1 } from "~/test/helpers/sqlite-d1";

vi.mock("~/lib/nutrition/fast-log-flag.server", () => ({
	assertNutritionFuelPage: vi.fn(),
	assertNutritionPhotoLog: vi.fn(),
}));

const readyAt = "2026-11-10T12:00:00.000Z";
const meta = {
	cost: 2,
	imageKey: "fuel-photo/user-1/req-1",
	mimeType: "image/jpeg",
	operationId: "op-1",
	draftId: "draft-1",
	readyAt,
};

const DDL = `
CREATE TABLE user (
  id TEXT PRIMARY KEY,
  tier TEXT,
  tier_expires_at INTEGER,
  settings TEXT
);
CREATE TABLE nutrition_fuel_day (
  user_id TEXT NOT NULL,
  fuel_date TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, fuel_date)
);
CREATE TABLE queue_job (
  request_id TEXT PRIMARY KEY,
  job_type TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  user_id TEXT,
  status TEXT NOT NULL,
  result_json TEXT,
  model_artifact TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
`;

const owner: NutritionPrincipal = {
	userId: "user-1",
	organizationId: "org-1",
	surface: "web",
	authMethod: "session",
};

async function seed() {
	const { database: db } = createSqliteD1();
	await db.exec(DDL);
	await db
		.prepare(
			"INSERT INTO user (id, tier, tier_expires_at, settings) VALUES (?, 'free', NULL, ?)",
		)
		.bind("user-1", JSON.stringify({ fuelTimeZone: "Europe/Dublin" }))
		.run();
	await db
		.prepare(
			"INSERT INTO nutrition_fuel_day (user_id, fuel_date, used) VALUES (?, ?, 3)",
		)
		.bind("user-1", "2026-11-10")
		.run();
	const expires = Math.floor(
		new Date("2026-11-11T12:00:00.000Z").getTime() / 1000,
	);
	await db
		.prepare(
			`INSERT INTO queue_job (
				request_id, job_type, organization_id, user_id, status,
				result_json, model_artifact, created_at, expires_at
			) VALUES (?, 'fuel_photo', 'org-1', 'user-1', 'completed', ?, NULL, ?, ?)`,
		)
		.bind("req-1", JSON.stringify(meta), expires, expires)
		.run();
	return db;
}

describe("fuel photo authorization and cap", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("refuses another user even when the organization matches", async () => {
		const db = await seed();
		const env = { DB: db } as Env;
		await expect(readFuelPhoto(env, "user-2", "req-1")).rejects.toBeInstanceOf(
			DiaryFoodNotFoundError,
		);
		const logIntake = vi.fn();
		await expect(
			confirmFuelPhoto(
				env,
				{ ...owner, userId: "user-2" },
				{} as never,
				"req-1",
				{ occurredAt: readyAt } as never,
				{ logIntake, now: new Date(readyAt) },
			),
		).rejects.toBeInstanceOf(DiaryFoodNotFoundError);
		expect(logIntake).not.toHaveBeenCalled();
	});

	it("does not insert or debit a ready draft when the free day is full", async () => {
		const db = await seed();
		const logIntake = vi.fn();
		const debit = vi.fn();
		await expect(
			confirmFuelPhoto(
				{ DB: db } as Env,
				owner,
				{} as never,
				"req-1",
				{ occurredAt: readyAt } as never,
				{ logIntake, debit, now: new Date(readyAt) },
			),
		).rejects.toBeInstanceOf(FuelDailyLimitError);
		expect(logIntake).not.toHaveBeenCalled();
		expect(debit).not.toHaveBeenCalled();
	});
});
