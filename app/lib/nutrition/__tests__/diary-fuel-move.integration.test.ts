/**
 * Moving a Fuel entry to another day (#11), against real SQLite with every
 * drizzle migration applied. Covers the shared service the MCP tool calls:
 * the old day's slot is freed, the new day is capped, and Apple Health keeps
 * the same sample id with a higher version so the phone replaces the sample.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	compareMigrationNames,
	splitDrizzleStatements,
} from "~/lib/drizzle-sql";
import { createMockEnv } from "~/test/helpers/mock-env";
import { createSqliteD1 } from "~/test/helpers/sqlite-d1";
import { getNutritionConsentStatement } from "../consent-policy";
import {
	DiaryFoodNotFoundError,
	logDiaryFood,
	updateDiaryFood,
} from "../diary.server";
import { FuelDailyLimitError, FuelDateImmutableError } from "../fuel-errors";
import type { NutritionPrincipal } from "../service.server";

const USER = "user-move";
const OTHER_USER = "user-other";
const ORG = "org-move";
const ZONE = "Europe/Dublin";
const NOW = new Date("2026-11-25T15:00:00.000Z");

const databases: Array<ReturnType<typeof createSqliteD1>["sqlite"]> = [];
afterEach(() => {
	for (const database of databases.splice(0)) database.close();
});

function migrate(sqlite: ReturnType<typeof createSqliteD1>["sqlite"]) {
	const dir = join(process.cwd(), "drizzle");
	const files = readdirSync(dir)
		.filter((name) => name.endsWith(".sql"))
		.sort(compareMigrationNames);
	for (const file of files) {
		for (const statement of splitDrizzleStatements(
			readFileSync(join(dir, file), "utf8"),
		)) {
			sqlite.exec(statement);
		}
	}
}

async function setup() {
	const { database, sqlite } = createSqliteD1({ doubleQuotedStrings: true });
	databases.push(sqlite);
	migrate(sqlite);
	const seconds = Math.floor(NOW.getTime() / 1000);
	for (const userId of [USER, OTHER_USER]) {
		sqlite
			.prepare(
				`INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at, settings, tier)
				 VALUES (?, ?, ?, 1, ?, ?, ?, 'free')`,
			)
			.run(
				userId,
				userId,
				`${userId}@example.test`,
				seconds,
				seconds,
				JSON.stringify({ fuelTimeZone: ZONE }),
			);
		for (const purpose of ["intake", "agent_processing"] as const) {
			const statement = await getNutritionConsentStatement(purpose);
			sqlite
				.prepare(
					`INSERT INTO nutrition_consent (id, user_id, purpose, policy_version, source, granted_at, created_at,
					   statement_version, statement_sha256, privacy_notice_version, client_surface)
					 VALUES (?, ?, ?, ?, 'web', ?, ?, ?, ?, ?, 'web')`,
				)
				.run(
					`${userId}-${purpose}`,
					userId,
					purpose,
					statement.policyVersion,
					seconds - 86_400,
					seconds - 86_400,
					statement.statementVersion,
					statement.sha256,
					statement.privacyNoticeVersion,
				);
		}
	}
	sqlite
		.prepare(
			"INSERT INTO organization (id, name, slug, created_at, credits) VALUES (?, 'Move Kitchen', 'move-kitchen', ?, 0)",
		)
		.run(ORG, seconds);
	const env = {
		...createMockEnv(),
		DB: database,
		RATION_ENV: "test",
		FEATURE_FLAG_OVERRIDES: JSON.stringify({
			"nutrition-fast-log": true,
			"nutrition-fuel-page": true,
		}),
	} as unknown as Env;
	return { env, sqlite };
}

function principal(userId = USER): NutritionPrincipal {
	return {
		userId,
		organizationId: ORG,
		surface: "mcp",
		authMethod: "api_key",
		scopes: ["nutrition:read", "nutrition:write"],
	};
}

const flags = { clientPlatform: "mcp", clientVersion: "1.11.45" };

let keyCounter = 0;
function key(): string {
	keyCounter += 1;
	return `00000000-0000-4000-8000-${String(keyCounter).padStart(12, "0")}`;
}

function food(fuelDate?: string) {
	return {
		name: "Porridge",
		macros: { energyKcal: 300, proteinG: 10, carbsG: 50, fatG: 6 },
		idempotencyKey: key(),
		operationKey: key(),
		...(fuelDate ? { fuelDate } : {}),
	};
}

type IntakeRow = {
	id: string;
	fuel_date: string | null;
	occurred_at: number;
	health_sync_id: string;
	health_sync_version: number;
	replaces_intake_id: string | null;
	voided_at: number | null;
};

function intake(
	sqlite: ReturnType<typeof createSqliteD1>["sqlite"],
	id: string,
): IntakeRow {
	return sqlite
		.prepare(
			`SELECT id, fuel_date, occurred_at, health_sync_id, health_sync_version,
			        replaces_intake_id, voided_at
			 FROM nutrition_intake WHERE id = ?`,
		)
		.get(id) as IntakeRow;
}

function used(
	sqlite: ReturnType<typeof createSqliteD1>["sqlite"],
	fuelDate: string,
): number {
	const row = sqlite
		.prepare(
			"SELECT used FROM nutrition_fuel_day WHERE user_id = ? AND fuel_date = ?",
		)
		.get(USER, fuelDate) as { used: number } | undefined;
	return row?.used ?? 0;
}

describe("updateDiaryFood moves a Fuel entry to another day", () => {
	it("moves the entry, frees the old day, and bumps the Health version on the same sample", async () => {
		const { env, sqlite } = await setup();
		const logged = await logDiaryFood(env, principal(), flags, {
			...food("2026-11-25"),
			now: NOW,
		});
		const before = intake(sqlite, logged.intakeId);
		expect(before.fuel_date).toBe("2026-11-25");
		expect(used(sqlite, "2026-11-25")).toBe(1);

		// The MCP tool pins a fuelDate-only move to local noon (pinFuelDayClock).
		const move = {
			...food("2026-11-24"),
			occurredAt: "2026-11-24T12:00:00.000Z",
		};
		const moved = await updateDiaryFood(
			env,
			principal(),
			flags,
			logged.intakeId,
			{ ...move, now: NOW },
		);
		expect(moved.intakeId).not.toBe(logged.intakeId);
		const after = intake(sqlite, moved.intakeId);
		expect(after.fuel_date).toBe("2026-11-24");
		expect(after.replaces_intake_id).toBe(logged.intakeId);
		// Same Health sample, higher version: the phone replaces it, no duplicate.
		expect(after.health_sync_id).toBe(before.health_sync_id);
		expect(after.health_sync_version).toBe(before.health_sync_version + 1);
		// Local noon on the new day (Dublin is UTC+0 in November).
		expect(new Date(after.occurred_at * 1000).toISOString()).toBe(
			"2026-11-24T12:00:00.000Z",
		);
		expect(intake(sqlite, logged.intakeId).voided_at).not.toBeNull();
		expect(used(sqlite, "2026-11-25")).toBe(0);
		expect(used(sqlite, "2026-11-24")).toBe(1);

		// Replay a minute later: same result, no second slot, no second row,
		// even though the first call voided the row it names.
		const replay = await updateDiaryFood(
			env,
			principal(),
			flags,
			logged.intakeId,
			{ ...move, now: new Date(NOW.getTime() + 60_000) },
		);
		expect(replay).toMatchObject({ intakeId: moved.intakeId, replayed: true });
		expect(used(sqlite, "2026-11-24")).toBe(1);
		const count = sqlite
			.prepare("SELECT count(*) AS n FROM nutrition_intake WHERE user_id = ?")
			.get(USER) as { n: number };
		expect(count.n).toBe(2);
	});

	it("still refuses a new edit of the replaced row", async () => {
		const { env } = await setup();
		const logged = await logDiaryFood(env, principal(), flags, {
			...food("2026-11-25"),
			now: NOW,
		});
		await updateDiaryFood(env, principal(), flags, logged.intakeId, {
			...food("2026-11-24"),
			now: NOW,
		});
		await expect(
			updateDiaryFood(env, principal(), flags, logged.intakeId, {
				...food("2026-11-23"),
				now: NOW,
			}),
		).rejects.toBeInstanceOf(DiaryFoodNotFoundError);
	});

	it("refuses a move into a full free day and leaves the entry where it was", async () => {
		const { env, sqlite } = await setup();
		for (let i = 0; i < 3; i += 1) {
			await logDiaryFood(env, principal(), flags, {
				...food("2026-11-23"),
				now: NOW,
			});
		}
		const logged = await logDiaryFood(env, principal(), flags, {
			...food("2026-11-25"),
			now: NOW,
		});
		await expect(
			updateDiaryFood(env, principal(), flags, logged.intakeId, {
				...food("2026-11-23"),
				now: NOW,
			}),
		).rejects.toBeInstanceOf(FuelDailyLimitError);
		expect(intake(sqlite, logged.intakeId).voided_at).toBeNull();
		expect(used(sqlite, "2026-11-25")).toBe(1);
		expect(used(sqlite, "2026-11-23")).toBe(3);
	});

	it("does not move another person's entry", async () => {
		const { env } = await setup();
		const theirs = await logDiaryFood(env, principal(OTHER_USER), flags, {
			...food("2026-11-25"),
			now: NOW,
		});
		await expect(
			updateDiaryFood(env, principal(), flags, theirs.intakeId, {
				...food("2026-11-24"),
				now: NOW,
			}),
		).rejects.toBeInstanceOf(DiaryFoodNotFoundError);
	});

	it("refuses a clock on another day without fuelDate", async () => {
		const { env } = await setup();
		const logged = await logDiaryFood(env, principal(), flags, {
			...food("2026-11-25"),
			now: NOW,
		});
		await expect(
			updateDiaryFood(env, principal(), flags, logged.intakeId, {
				...food(),
				occurredAt: "2026-11-22T09:00:00.000Z",
				now: NOW,
			}),
		).rejects.toBeInstanceOf(FuelDateImmutableError);
	});
});
