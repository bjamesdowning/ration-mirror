import { describe, expect, it } from "vitest";
import {
	assertFuelCreateRoom,
	completedFuelReplay,
	ensureFuelTimeZone,
	personIsCrew,
	readFuelUsed,
	releaseFuelSlot,
	reserveFuelSlot,
	stampFuelDate,
} from "~/lib/nutrition/fuel-cap.server";
import {
	FuelDailyLimitError,
	FuelTimezoneRequiredError,
} from "~/lib/nutrition/fuel-errors";
import { photoConfirmSlotCount } from "~/lib/nutrition/fuel-photo.server";
import { createSqliteD1 } from "~/test/helpers/sqlite-d1";

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
`;

async function seed(tier = "free", zone = "Europe/Dublin") {
	const { database: db } = createSqliteD1();
	await db.exec(DDL);
	await db
		.prepare(
			"INSERT INTO user (id, tier, tier_expires_at, settings) VALUES (?, ?, NULL, ?)",
		)
		.bind("user-1", tier, JSON.stringify({ fuelTimeZone: zone }))
		.run();
	return db;
}

describe("fuel cap", () => {
	it("lets the third free log succeed and blocks the fourth", async () => {
		const db = await seed();
		for (let i = 0; i < 3; i += 1) {
			await reserveFuelSlot(db, "user-1", "2026-11-10", false);
		}
		expect(await readFuelUsed(db, "user-1", "2026-11-10")).toBe(3);
		await expect(
			reserveFuelSlot(db, "user-1", "2026-11-10", false),
		).rejects.toMatchObject({
			code: "fuel_daily_limit",
			upgradeRequired: true,
			limit: 3,
			used: 3,
			localDate: "2026-11-10",
			status: 403,
		});
		expect(await readFuelUsed(db, "user-1", "2026-11-10")).toBe(3);
	});

	it("serializes two free updates so both cannot pass used = 2", async () => {
		const db = await seed();
		await reserveFuelSlot(db, "user-1", "2026-11-10", false);
		await reserveFuelSlot(db, "user-1", "2026-11-10", false);
		const first = reserveFuelSlot(db, "user-1", "2026-11-10", false);
		const second = reserveFuelSlot(db, "user-1", "2026-11-10", false);
		const results = await Promise.allSettled([first, second]);
		const rejected = results.filter((result) => result.status === "rejected");
		expect(rejected).toHaveLength(1);
		expect(await readFuelUsed(db, "user-1", "2026-11-10")).toBe(3);
	});

	it("increments crew without a ceiling and blocks a same-day downgrade", async () => {
		const db = await seed("crew_member");
		expect(
			await personIsCrew(db, "user-1", new Date("2026-11-10T12:00:00Z")),
		).toBe(true);
		for (let i = 0; i < 4; i += 1) {
			await reserveFuelSlot(db, "user-1", "2026-11-10", true);
		}
		expect(await readFuelUsed(db, "user-1", "2026-11-10")).toBe(4);
		await db
			.prepare("UPDATE user SET tier = ? WHERE id = ?")
			.bind("free", "user-1")
			.run();
		await expect(
			assertFuelCreateRoom(
				db,
				"user-1",
				new Date("2026-11-10T12:00:00Z"),
				new Date("2026-11-10T12:00:00Z"),
			),
		).rejects.toBeInstanceOf(FuelDailyLimitError);
		expect(await readFuelUsed(db, "user-1", "2026-11-10")).toBe(4);
	});

	it("void decrements once", async () => {
		const db = await seed();
		await reserveFuelSlot(db, "user-1", "2026-11-10", false);
		await releaseFuelSlot(db, "user-1", "2026-11-10");
		await releaseFuelSlot(db, "user-1", "2026-11-10");
		expect(await readFuelUsed(db, "user-1", "2026-11-10")).toBe(0);
	});

	it("returns a completed replay without incrementing used", async () => {
		const db = await seed();
		await db.exec(`
			CREATE TABLE nutrition_operation (
				user_id text,
				operation_key text,
				status text,
				result_json text
			);
		`);
		await reserveFuelSlot(db, "user-1", "2026-11-10", false);
		await db
			.prepare(
				`INSERT INTO nutrition_operation (user_id, operation_key, status, result_json)
				 VALUES (?, ?, 'completed', ?)`,
			)
			.bind("user-1", "op-1", JSON.stringify({ intakeId: "intake-1" }))
			.run();
		await expect(completedFuelReplay(db, "user-1", "op-1")).resolves.toEqual({
			intakeId: "intake-1",
		});
		expect(await readFuelUsed(db, "user-1", "2026-11-10")).toBe(1);
		await expect(completedFuelReplay(db, "other", "op-1")).resolves.toBeNull();
	});

	it("stores a valid candidate and stamps that zone, not a client day", async () => {
		const db = await seed("free", "");
		const occurredAt = new Date("2026-11-11T07:30:00.000Z");
		const fuelDate = await stampFuelDate(
			db,
			"user-1",
			occurredAt,
			"America/Los_Angeles",
		);
		expect(fuelDate).toBe("2026-11-10");
		const row = await db
			.prepare(
				"SELECT json_extract(settings, '$.fuelTimeZone') AS zone FROM user WHERE id = ?",
			)
			.bind("user-1")
			.first<{ zone: string }>();
		expect(row?.zone).toBe("America/Los_Angeles");
	});

	it("updates the stored zone for a later row and does not rewrite the first stamp", async () => {
		const db = await seed("free", "America/Los_Angeles");
		const first = await stampFuelDate(
			db,
			"user-1",
			new Date("2026-11-11T07:30:00.000Z"),
			"America/Los_Angeles",
		);
		const second = await stampFuelDate(
			db,
			"user-1",
			new Date("2026-11-11T07:30:00.000Z"),
			"Europe/Dublin",
		);
		expect(first).toBe("2026-11-10");
		expect(second).toBe("2026-11-11");
		const row = await db
			.prepare(
				"SELECT json_extract(settings, '$.fuelTimeZone') AS zone FROM user WHERE id = ?",
			)
			.bind("user-1")
			.first<{ zone: string }>();
		expect(row?.zone).toBe("Europe/Dublin");
	});

	it("rejects GMT without replacing a stored zone", async () => {
		const db = await seed();
		await expect(ensureFuelTimeZone(db, "user-1", "GMT")).resolves.toBe(
			"Europe/Dublin",
		);
		const row = await db
			.prepare(
				"SELECT json_extract(settings, '$.fuelTimeZone') AS zone FROM user WHERE id = ?",
			)
			.bind("user-1")
			.first<{ zone: string }>();
		expect(row?.zone).toBe("Europe/Dublin");
	});

	it("returns fuel_timezone_required when no candidate and no stored zone exist", async () => {
		const db = await seed("free", "");
		await expect(ensureFuelTimeZone(db, "user-1", null)).rejects.toBeInstanceOf(
			FuelTimezoneRequiredError,
		);
	});

	it("returns a completed replay without writing a zone", async () => {
		const db = await seed("free", "");
		await db.exec(`
			CREATE TABLE nutrition_operation (
				user_id text,
				operation_key text,
				status text,
				result_json text
			);
		`);
		await db
			.prepare(
				`INSERT INTO nutrition_operation (user_id, operation_key, status, result_json)
				 VALUES (?, ?, 'completed', ?)`,
			)
			.bind("user-1", "op-replay", JSON.stringify({ intakeId: "intake-9" }))
			.run();
		await expect(
			completedFuelReplay(db, "user-1", "op-replay"),
		).resolves.toEqual({ intakeId: "intake-9" });
		const row = await db
			.prepare(
				"SELECT json_extract(settings, '$.fuelTimeZone') AS zone FROM user WHERE id = ?",
			)
			.bind("user-1")
			.first<{ zone: string | null }>();
		expect(row?.zone ?? "").toBe("");
	});

	it("counts a photo confirm as one slot however many foods were seen", () => {
		expect(photoConfirmSlotCount(2)).toBe(1);
		expect(photoConfirmSlotCount(0)).toBe(1);
	});
});
