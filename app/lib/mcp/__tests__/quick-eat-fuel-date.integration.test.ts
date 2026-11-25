/**
 * Quick Eat with a chosen `date`, against real SQLite with every drizzle
 * migration applied. Live 1.11.45 replied with the chosen day but stored the
 * Manifest day as today, so reads by that day showed the entry on today.
 * These tests read the stored row and every day read, not only the reply.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	compareMigrationNames,
	splitDrizzleStatements,
} from "~/lib/drizzle-sql";
import { getNutritionConsentStatement } from "~/lib/nutrition/consent-policy";
import {
	getNutritionSummary,
	listNutritionIntakesForRange,
} from "~/lib/nutrition/persist.server";
import { createMockEnv } from "~/test/helpers/mock-env";
import { createSqliteD1 } from "~/test/helpers/sqlite-d1";
import type { McpToolContext } from "../auth";
import { createQuickEatToolDefs } from "../tools/quick-eat";

const USER = "user-quick-eat";
const ORG = "org-quick-eat";
const CARGO_ID = "c0000000-0000-4000-8000-000000000001";
const ZONE = "Europe/Dublin";
const NOW = new Date("2026-11-25T15:00:00.000Z");
const TODAY = "2026-11-25";
const CHOSEN = "2026-12-20";

type Sqlite = ReturnType<typeof createSqliteD1>["sqlite"];

const databases: Sqlite[] = [];
beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(NOW);
});
afterEach(() => {
	vi.useRealTimers();
	for (const database of databases.splice(0)) database.close();
});

function migrate(sqlite: Sqlite) {
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
	sqlite
		.prepare(
			`INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at, settings, tier)
			 VALUES (?, ?, ?, 1, ?, ?, ?, 'free')`,
		)
		.run(
			USER,
			USER,
			`${USER}@example.test`,
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
				`${USER}-${purpose}`,
				USER,
				purpose,
				statement.policyVersion,
				seconds - 86_400,
				seconds - 86_400,
				statement.statementVersion,
				statement.sha256,
				statement.privacyNoticeVersion,
			);
	}
	sqlite
		.prepare(
			"INSERT INTO organization (id, name, slug, created_at, credits) VALUES (?, 'Quick Eat Kitchen', 'quick-eat-kitchen', ?, 0)",
		)
		.run(ORG, seconds);
	sqlite
		.prepare(
			`INSERT INTO cargo (id, organization_id, name, quantity, unit, nutrition, created_at, updated_at)
			 VALUES (?, ?, 'Whole milk', 1000, 'ml', ?, ?, ?)`,
		)
		.run(
			CARGO_ID,
			ORG,
			JSON.stringify({
				source: "usda",
				confidence: 1,
				verified: true,
				per100g: { energyKcal: 64, proteinG: 3.3, carbG: 4.8, fatG: 3.6 },
				perServing: null,
			}),
			seconds,
			seconds,
		);
	const env = {
		...createMockEnv(),
		DB: database,
		RATION_ENV: "test",
		FEATURE_FLAG_OVERRIDES: JSON.stringify({
			"nutrition-fast-log": true,
			"nutrition-fuel-page": true,
			"plan-fuel-actions": true,
		}),
	} as unknown as Env;
	return { env, sqlite };
}

const ctx: McpToolContext = {
	organizationId: ORG,
	userId: USER,
	scopes: ["mcp:inventory:write", "mcp:manifest:write", "mcp:nutrition:write"],
	authMethod: "api_key",
	apiKeyId: "key-1",
	keyName: "test",
	keyPrefix: "t_",
	preClaim: false,
	agentSurface: "mcp",
};

function quickEat(env: Env) {
	const tool = createQuickEatToolDefs(env as never)[0];
	if (!tool) throw new Error("quick_eat_cargo is missing");
	return tool;
}

type IntakeRow = {
	id: string;
	fuel_date: string | null;
	manifest_date: string;
	occurred_at: number;
};

function intakes(sqlite: Sqlite): IntakeRow[] {
	return sqlite
		.prepare(
			"SELECT id, fuel_date, manifest_date, occurred_at FROM nutrition_intake WHERE user_id = ?",
		)
		.all(USER) as IntakeRow[];
}

function cargoQuantity(sqlite: Sqlite): number {
	return (
		sqlite.prepare("SELECT quantity FROM cargo WHERE id = ?").get(CARGO_ID) as {
			quantity: number;
		}
	).quantity;
}

function slotsUsed(sqlite: Sqlite, fuelDate: string): number {
	const row = sqlite
		.prepare(
			"SELECT used FROM nutrition_fuel_day WHERE user_id = ? AND fuel_date = ?",
		)
		.get(USER, fuelDate) as { used: number } | undefined;
	return row?.used ?? 0;
}

/** Entries on one day, read by Fuel day and by Manifest day. */
async function entriesOn(env: Env, date: string) {
	const [byFuel, byManifest, summaryByFuel, summaryByManifest] =
		await Promise.all([
			listNutritionIntakesForRange(env.DB, USER, ORG, date, date, {
				dateField: "fuel",
				crossOrgDiary: true,
			}),
			listNutritionIntakesForRange(env.DB, USER, ORG, date, date, {
				dateField: "manifest",
			}),
			getNutritionSummary(env.DB, USER, ORG, date, date, {
				dateField: "fuel",
				crossOrgDiary: true,
			}),
			getNutritionSummary(env.DB, USER, ORG, date, date, {
				dateField: "manifest",
			}),
		]);
	const energy = (days: { date: string; energyKcal: number }[]) =>
		days.find((day) => day.date === date)?.energyKcal ?? 0;
	return {
		fuel: byFuel.items.length,
		manifest: byManifest.items.length,
		fuelKcal: energy(summaryByFuel.days),
		manifestKcal: energy(summaryByManifest.days),
	};
}

describe("quick_eat_cargo stores the Fuel entry on the chosen date", () => {
	it("stores and reads it on that day, not today, and the reply agrees", async () => {
		const { env, sqlite } = await setup();
		const envelope = await quickEat(env).handler(ctx, {
			cargoId: CARGO_ID,
			quantity: 200,
			unit: "ml",
			date: CHOSEN,
			operationKey: "c0000000-0000-4000-8000-000000000010",
		});
		expect(envelope.ok).toBe(true);
		if (!envelope.ok) return;
		const reply = envelope.data as { fuelDate?: string; intakeId?: string };
		expect(reply.fuelDate).toBe(CHOSEN);

		const [row] = intakes(sqlite);
		expect(row?.id).toBe(reply.intakeId);
		expect(row?.fuel_date).toBe(reply.fuelDate);
		expect(row?.manifest_date).toBe(reply.fuelDate);
		// Local noon on the chosen day (Dublin is UTC+0 in December).
		expect(new Date((row?.occurred_at ?? 0) * 1000).toISOString()).toBe(
			`${CHOSEN}T12:00:00.000Z`,
		);

		const chosen = await entriesOn(env, CHOSEN);
		expect(chosen.fuel).toBe(1);
		expect(chosen.manifest).toBe(1);
		expect(chosen.fuelKcal).toBeCloseTo(128);
		expect(chosen.manifestKcal).toBeCloseTo(128);
		expect(await entriesOn(env, TODAY)).toEqual({
			fuel: 0,
			manifest: 0,
			fuelKcal: 0,
			manifestKcal: 0,
		});
		expect(slotsUsed(sqlite, CHOSEN)).toBe(1);
		expect(slotsUsed(sqlite, TODAY)).toBe(0);
		expect(cargoQuantity(sqlite)).toBe(800);
	});

	it("logs today when no date is given", async () => {
		const { env, sqlite } = await setup();
		const envelope = await quickEat(env).handler(ctx, {
			cargoId: CARGO_ID,
			quantity: 200,
			unit: "ml",
			operationKey: "c0000000-0000-4000-8000-000000000011",
		});
		expect(envelope.ok).toBe(true);
		if (!envelope.ok) return;
		expect(envelope.data).not.toHaveProperty("fuelDate");
		const [row] = intakes(sqlite);
		expect(row?.fuel_date).toBe(TODAY);
		expect(row?.manifest_date).toBe(TODAY);
		expect(row?.occurred_at).toBe(Math.floor(NOW.getTime() / 1000));
		expect((await entriesOn(env, TODAY)).fuel).toBe(1);
		expect(slotsUsed(sqlite, TODAY)).toBe(1);
	});

	it.each(["2026-02-31", "2026-13-01", "2026-00-10"])(
		"refuses %s before any write or Cargo deduction",
		async (date) => {
			const { env, sqlite } = await setup();
			const envelope = await quickEat(env).handler(ctx, {
				cargoId: CARGO_ID,
				quantity: 200,
				unit: "ml",
				date,
				operationKey: "c0000000-0000-4000-8000-000000000012",
			});
			expect(envelope.ok).toBe(false);
			if (envelope.ok) return;
			expect(envelope.error.code).toBe("invalid_input");
			expect(intakes(sqlite)).toEqual([]);
			expect(cargoQuantity(sqlite)).toBe(1000);
			const operations = sqlite
				.prepare("SELECT count(*) AS n FROM nutrition_operation")
				.get() as { n: number };
			expect(operations.n).toBe(0);
		},
	);
});
