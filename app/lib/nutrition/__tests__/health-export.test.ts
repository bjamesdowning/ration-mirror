import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { createMockKV } from "~/test/helpers/mock-env";
import { createSqliteD1 } from "~/test/helpers/sqlite-d1";
import { getNutritionConsentStatement } from "../consent-policy";
import {
	advanceHealthCursor,
	emptyHealthCursor,
	type HealthCursor,
	type HealthIntakeRow,
	mayOpenHealthStore,
	planHealthExport,
	samplesSafeToWrite,
} from "../health-export";
import {
	getHealthExportPending,
	setHealthExportPreference,
} from "../health-export.server";
import type { NutritionPrincipal } from "../service.server";

const databases: Array<ReturnType<typeof createSqliteD1>["sqlite"]> = [];
const now = new Date("2026-11-09T12:00:00.000Z");
const recent = Math.floor(now.getTime() / 1000);
const stale = Math.floor(new Date("2020-01-01T00:00:00.000Z").getTime() / 1000);

afterEach(() => {
	for (const sqlite of databases.splice(0)) sqlite.close();
});

const principal: NutritionPrincipal = {
	userId: "user-a",
	organizationId: "org-1",
	surface: "web",
	authMethod: "session",
};

const webFlags = { userId: "user-a", clientPlatform: "web" as const };

function row(
	patch: Partial<HealthIntakeRow> & Pick<HealthIntakeRow, "id">,
): HealthIntakeRow {
	return {
		userId: "user-a",
		organizationId: "org-1",
		name: "Yogurt",
		voidedAt: null,
		healthSyncId: patch.id,
		healthSyncVersion: 1,
		compositionSource: "usda",
		compositionConfirmedAt: recent,
		energyKcal: 120,
		proteinG: 10,
		carbsG: 8,
		fatG: 4,
		fiberG: null,
		occurredAt: recent,
		verified: 0,
		...patch,
	};
}

describe("health export plan", () => {
	it("exports confirmed eaten macros and never a daily total", () => {
		const plan = planHealthExport({
			rows: [row({ id: "food-1", healthSyncId: "sync-1", fiberG: 2 })],
			viewerUserId: "user-a",
			activeOrganizationId: "org-1",
			crossKitchen: false,
			cursor: emptyHealthCursor(),
		});
		expect(plan.dailyTotals).toEqual([]);
		expect(plan.deletes).toEqual([]);
		expect(plan.samples.map((sample) => sample.quantityType)).toEqual([
			"dietaryEnergyConsumed",
			"dietaryProtein",
			"dietaryCarbohydrates",
			"dietaryFatTotal",
			"dietaryFiber",
		]);
		expect(plan.samples.every((sample) => sample.action === "write")).toBe(
			true,
		);
		expect(plan.samples[0]?.syncIdentifier).toBe(
			"ration:sync-1:dietaryEnergyConsumed",
		);
	});

	it("omits fiber when it is unknown and skips an ai estimate, a meal, and another person", () => {
		const plan = planHealthExport({
			rows: [
				row({ id: "usda", healthSyncId: "sync-usda" }),
				row({
					id: "ai",
					healthSyncId: "sync-ai",
					compositionSource: "ai_estimate",
					compositionConfirmedAt: recent,
				}),
				row({
					id: "meal",
					healthSyncId: "sync-meal",
					compositionSource: "meal",
					verified: 1,
				}),
				row({
					id: "other",
					userId: "user-b",
					healthSyncId: "sync-other",
				}),
				row({
					id: "kitchen",
					organizationId: "org-2",
					healthSyncId: "sync-kitchen",
				}),
			],
			viewerUserId: "user-a",
			activeOrganizationId: "org-1",
			crossKitchen: false,
			cursor: emptyHealthCursor(),
		});
		expect(plan.samples.map((sample) => sample.healthSyncId)).toEqual([
			"sync-usda",
			"sync-usda",
			"sync-usda",
			"sync-usda",
		]);
		expect(
			plan.samples.some((sample) => sample.quantityType === "dietaryFiber"),
		).toBe(false);
	});

	it("skips the same version, replaces a higher version, and deletes a void", () => {
		const cursor: HealthCursor = { written: { "sync-1": 1 }, deleted: [] };
		const same = planHealthExport({
			rows: [row({ id: "food-1", healthSyncId: "sync-1" })],
			viewerUserId: "user-a",
			activeOrganizationId: "org-1",
			crossKitchen: false,
			cursor,
		});
		expect(same.samples).toEqual([]);
		const replaced = planHealthExport({
			rows: [
				row({ id: "food-1", healthSyncId: "sync-1", healthSyncVersion: 2 }),
			],
			viewerUserId: "user-a",
			activeOrganizationId: "org-1",
			crossKitchen: false,
			cursor,
		});
		expect(new Set(replaced.samples.map((sample) => sample.action))).toEqual(
			new Set(["replace"]),
		);
		expect(replaced.samples[0]?.syncVersion).toBe(2);
		const voided = planHealthExport({
			rows: [row({ id: "food-1", healthSyncId: "sync-1", voidedAt: recent })],
			viewerUserId: "user-a",
			activeOrganizationId: "org-1",
			crossKitchen: false,
			cursor,
		});
		expect(voided.samples).toEqual([]);
		expect(voided.deletes).toEqual([
			{
				action: "delete",
				healthSyncId: "sync-1",
				syncIdentifiers: [
					"ration:sync-1:dietaryEnergyConsumed",
					"ration:sync-1:dietaryProtein",
					"ration:sync-1:dietaryCarbohydrates",
					"ration:sync-1:dietaryFatTotal",
					"ration:sync-1:dietaryFiber",
				],
			},
		]);
		const next = advanceHealthCursor(cursor, voided);
		const again = planHealthExport({
			rows: [row({ id: "food-1", healthSyncId: "sync-1", voidedAt: recent })],
			viewerUserId: "user-a",
			activeOrganizationId: "org-1",
			crossKitchen: false,
			cursor: next,
		});
		expect(again.deletes).toEqual([]);
		expect(again.samples).toEqual([]);
	});

	it("refuses a daily total and types Ration does not collect", () => {
		const sample = {
			action: "write" as const,
			syncIdentifier: "ration:sync-1:dietaryEnergyConsumed",
			syncVersion: 1,
			quantityType: "dietaryEnergyConsumed" as const,
			value: 1,
			unit: "kcal" as const,
			intakeId: "food-1",
			healthSyncId: "sync-1",
			occurredAt: now.toISOString(),
			foodName: "Yogurt",
		};
		expect(samplesSafeToWrite([sample])).toEqual([sample]);
		for (const quantityType of [
			"dailyTotal",
			"bodyMass",
			"stepCount",
			"activeEnergyBurned",
			"workout",
		] as const) {
			expect(
				samplesSafeToWrite([
					{
						...sample,
						quantityType: quantityType as "dietaryEnergyConsumed",
						syncIdentifier: `ration:sync-1:${quantityType}`,
					},
				]),
			).toEqual([]);
		}
		expect(mayOpenHealthStore({ intakeConsent: false, enabled: true })).toBe(
			false,
		);
		expect(mayOpenHealthStore({ intakeConsent: true, enabled: true })).toBe(
			true,
		);
	});
});

describe("health export handler", () => {
	it("does not read tier, and a free account matches a Crew account", async () => {
		const source = readFileSync(
			new URL("../health-export.server.ts", import.meta.url),
			"utf8",
		);
		expect(source).not.toMatch(
			/\.tier|crew_required|upgrade_required|HKHealthStore|PaywallView/,
		);
		const { database, sqlite, queries } = setup();
		await grant(sqlite);
		await setHealthExportPreference(envFor(database), principal, webFlags, {
			enabled: true,
			confirm: true,
			deviceStatus: "on",
		});
		const free = await getHealthExportPending(
			envFor(database),
			principal,
			webFlags,
			{ cursor: emptyHealthCursor(), now },
		);
		sqlite
			.prepare("update user set tier = 'crew_member' where id = 'user-a'")
			.run();
		const crew = await getHealthExportPending(
			envFor(database),
			principal,
			webFlags,
			{ cursor: emptyHealthCursor(), now },
		);
		expect(crew).toEqual(free);
		expect(JSON.stringify(crew)).not.toMatch(/crew_required|upgrade_required/);
		expect(queries.some((query) => /\btier\b/i.test(query))).toBe(false);
		expect(free.dailyTotals).toEqual([]);
		expect(free.samples.map((sample) => sample.healthSyncId)).toContain(
			"sync-usda",
		);
		expect(free.samples.map((sample) => sample.healthSyncId)).not.toContain(
			"sync-ai",
		);
		expect(free.samples.map((sample) => sample.healthSyncId)).not.toContain(
			"sync-meal",
		);
		expect(free.samples.map((sample) => sample.healthSyncId)).not.toContain(
			"sync-other",
		);
		expect(free.samples.map((sample) => sample.healthSyncId)).not.toContain(
			"sync-kitchen",
		);
		expect(free.samples.map((sample) => sample.healthSyncId)).not.toContain(
			"sync-old",
		);
		expect(free.deletes.map((item) => item.healthSyncId)).toEqual([
			"sync-void",
		]);
		const again = await getHealthExportPending(
			envFor(database),
			principal,
			webFlags,
			{ cursor: free.nextCursor, now },
		);
		expect(again.samples).toEqual([]);
		expect(again.deletes).toEqual([]);
	});

	it("returns FEATURE_DISABLED when the flag is off or the iOS client is below 1.6", async () => {
		const { database } = setup();
		const off = await capture(() =>
			getHealthExportPending(
				envFor(database, () => false),
				principal,
				webFlags,
				{ cursor: emptyHealthCursor(), now },
			),
		);
		expect(codeOf(off)).toBe("FEATURE_DISABLED");
		const ios = await capture(() =>
			getHealthExportPending(
				envFor(database),
				principal,
				{
					userId: "user-a",
					clientPlatform: "ios",
					clientVersion: "1.5.19",
				},
				{ cursor: emptyHealthCursor(), now },
			),
		);
		expect(codeOf(ios)).toBe("FEATURE_DISABLED");
	});

	it("does not continue when intake consent is missing", async () => {
		const { database, queries } = setup();
		const error = await capture(() =>
			getHealthExportPending(envFor(database), principal, webFlags, {
				cursor: emptyHealthCursor(),
				now,
			}),
		);
		expect(codeOf(error)).toBe("nutrition_consent_required");
		expect(queries.some((query) => query.includes("nutrition_intake"))).toBe(
			false,
		);
		expect(mayOpenHealthStore({ intakeConsent: false, enabled: true })).toBe(
			false,
		);
	});

	it("returns an empty feed when the preference is off", async () => {
		const { database, sqlite } = setup();
		await grant(sqlite);
		const pending = await getHealthExportPending(
			envFor(database),
			principal,
			webFlags,
			{ cursor: emptyHealthCursor(), now },
		);
		expect(pending.samples).toEqual([]);
		expect(pending.deletes).toEqual([]);
		expect(pending.status).toBe("off");
	});
});

function setup() {
	const { database, sqlite } = createSqliteD1();
	databases.push(sqlite);
	const queries: string[] = [];
	const prepare = database.prepare.bind(database);
	database.prepare = (query: string) => {
		queries.push(query);
		if (/\btier\b/i.test(query)) {
			throw new Error(`handler read tier: ${query}`);
		}
		return prepare(query);
	};
	sqlite.exec(`
		create table user (
			id text primary key,
			name text not null,
			email text not null,
			email_verified integer not null,
			created_at integer not null,
			updated_at integer not null,
			tier text not null,
			settings text
		);
		insert into user (
			id, name, email, email_verified, created_at, updated_at, tier, settings
		) values (
			'user-a', 'A', 'a@example.com', 1, 1, 1, 'free', '{}'
		);
		create table nutrition_consent (
			id text primary key,
			user_id text not null,
			purpose text not null,
			policy_version text not null,
			statement_version text,
			statement_sha256 text,
			privacy_notice_version text,
			source text not null,
			client_surface text,
			client_version text,
			locale text,
			request_id text,
			withdraw_request_id text,
			granted_at integer not null,
			withdrawn_at integer,
			created_at integer not null
		);
		create table nutrition_intake (
			id text primary key,
			user_id text not null,
			organization_id text,
			meal_name_snapshot text,
			voided_at integer,
			health_sync_id text,
			health_sync_version integer,
			composition_source text,
			composition_confirmed_at integer,
			energy_kcal real,
			protein_g real,
			carbs_g real,
			fat_g real,
			fiber_g real,
			occurred_at integer not null,
			verified integer not null
		);
	`);
	insertIntake(sqlite, {
		id: "usda",
		sync: "sync-usda",
		source: "usda",
		confirmed: recent,
	});
	insertIntake(sqlite, {
		id: "ai",
		sync: "sync-ai",
		source: "ai_estimate",
		confirmed: recent,
	});
	insertIntake(sqlite, {
		id: "meal",
		sync: "sync-meal",
		source: "meal",
		confirmed: recent,
		verified: 1,
	});
	insertIntake(sqlite, {
		id: "other",
		userId: "user-b",
		sync: "sync-other",
		source: "usda",
		confirmed: recent,
	});
	insertIntake(sqlite, {
		id: "kitchen",
		organizationId: "org-2",
		sync: "sync-kitchen",
		source: "usda",
		confirmed: recent,
	});
	insertIntake(sqlite, {
		id: "old",
		sync: "sync-old",
		source: "usda",
		confirmed: stale,
		occurred: stale,
	});
	insertIntake(sqlite, {
		id: "voided",
		sync: "sync-void",
		source: "usda",
		confirmed: recent,
		voided: recent,
	});
	return { database, sqlite, queries };
}

function insertIntake(
	sqlite: ReturnType<typeof createSqliteD1>["sqlite"],
	input: {
		id: string;
		userId?: string;
		organizationId?: string;
		sync: string;
		source: string;
		confirmed: number | null;
		occurred?: number;
		verified?: number;
		voided?: number | null;
	},
) {
	sqlite
		.prepare(
			`insert into nutrition_intake (
				id, user_id, organization_id, meal_name_snapshot, voided_at,
				health_sync_id, health_sync_version, composition_source,
				composition_confirmed_at, energy_kcal, protein_g, carbs_g, fat_g,
				fiber_g, occurred_at, verified
			) values (?, ?, ?, 'Yogurt', ?, ?, 1, ?, ?, 120, 10, 8, 4, null, ?, ?)`,
		)
		.run(
			input.id,
			input.userId ?? "user-a",
			input.organizationId ?? "org-1",
			input.voided ?? null,
			input.sync,
			input.source,
			input.confirmed,
			input.occurred ?? recent,
			input.verified ?? 0,
		);
}

async function grant(sqlite: ReturnType<typeof createSqliteD1>["sqlite"]) {
	const statement = await getNutritionConsentStatement("intake");
	sqlite.exec(`
		insert into nutrition_consent (
			id, user_id, purpose, policy_version, statement_version, statement_sha256,
			privacy_notice_version, source, granted_at, created_at
		) values (
			'consent-1', 'user-a', 'intake', '${statement.policyVersion}',
			'${statement.statementVersion}', '${statement.sha256}',
			'${statement.privacyNoticeVersion}', 'web', 1, 1
		);
	`);
}

function envFor(
	database: D1Database,
	flags: (key: string) => boolean = (key) =>
		key !== "nutrition-cross-org-diary",
): Env {
	return {
		DB: database,
		RATION_KV: createMockKV(),
		FLAGS: {
			getBooleanValue: async (key: string) => flags(key),
		},
	} as unknown as Env;
}

async function capture(run: () => Promise<unknown>): Promise<unknown> {
	try {
		return await run();
	} catch (error) {
		return error;
	}
}

function codeOf(result: unknown): string | undefined {
	if (!result || typeof result !== "object") return undefined;
	const record = result as { data?: { code?: string }; code?: string };
	return record.data?.code ?? record.code;
}
