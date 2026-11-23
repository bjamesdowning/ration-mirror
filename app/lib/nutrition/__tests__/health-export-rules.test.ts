import { afterEach, describe, expect, it } from "vitest";
import { createMockKV } from "~/test/helpers/mock-env";
import { createSqliteD1 } from "~/test/helpers/sqlite-d1";
import { getNutritionConsentStatement } from "../consent-policy";
import { healthExportRulesFor } from "../fuel-capture";
import { selectPublishableFuelItems } from "../fuel-dto.server";
import { type HealthIntakeRow, planHealthExport } from "../health-export";
import {
	getHealthExportPending,
	setHealthExportPreference,
} from "../health-export.server";
import {
	acceptedEstimateStamp,
	healthEstimateAcceptNeeded,
	healthSampleUsable,
	intakeCompositionAfterEstimate,
} from "../health-exportability";
import type { NutritionPrincipal } from "../service.server";

const databases: Array<ReturnType<typeof createSqliteD1>["sqlite"]> = [];
const now = new Date("2026-11-09T12:00:00.000Z");
const recent = Math.floor(now.getTime() / 1000);

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
const ios = (clientVersion: string) => ({
	userId: "user-a",
	clientPlatform: "ios" as const,
	clientVersion,
});

const base = {
	viewerUserId: "user-a",
	activeOrganizationId: "org-1",
	crossKitchen: false,
};

function row(
	patch: Partial<HealthIntakeRow> & Pick<HealthIntakeRow, "id">,
): HealthIntakeRow {
	return {
		userId: "user-a",
		organizationId: "org-1",
		name: "Toast",
		voidedAt: null,
		healthSyncId: `sync-${patch.id}`,
		healthSyncVersion: 1,
		compositionSource: "usda",
		compositionConfirmedAt: recent,
		energyKcal: 200,
		proteinG: 8,
		carbsG: 30,
		fatG: 5,
		fiberG: 2,
		occurredAt: recent,
		...patch,
	};
}

const everySource = () => [
	row({ id: "usda" }),
	row({
		id: "ai",
		compositionSource: "ai_estimate",
		compositionConfirmedAt: null,
	}),
	row({ id: "meal", compositionSource: "meal" }),
	row({
		id: "barcode",
		compositionSource: "barcode",
		compositionConfirmedAt: null,
	}),
	row({ id: "typed", compositionSource: "manual_macros" }),
	row({ id: "override", compositionSource: "user_override" }),
	row({ id: "unknown", compositionSource: null, compositionConfirmedAt: null }),
];

function exportedIds(plan: ReturnType<typeof planHealthExport>): string[] {
	return [...new Set(plan.samples.map((sample) => sample.healthSyncId))];
}

describe("current Health rule: every usable Fuel log", () => {
	it("exports every usable source except an unaccepted AI estimate", () => {
		const plan = planHealthExport({
			...base,
			rows: everySource(),
			rules: "current",
		});
		expect(exportedIds(plan)).toEqual([
			"sync-usda",
			"sync-meal",
			"sync-barcode",
			"sync-typed",
			"sync-override",
			"sync-unknown",
		]);
		expect(plan.samples.some((sample) => sample.estimate)).toBe(false);
		expect(
			plan.samples.every((sample) => !sample.foodName.startsWith("Estimate")),
		).toBe(true);
		expect(plan.excluded).toEqual({
			aiEstimate: 1,
			unconfirmed: 0,
			notExportable: 0,
		});
		expect(plan.deletes).toEqual([]);
	});

	it("does not export an unaccepted ai_estimate and does export an accepted one", () => {
		const accepted = acceptedEstimateStamp(now);
		const plan = planHealthExport({
			...base,
			rows: [
				row({
					id: "open",
					name: "Soup",
					compositionSource: "ai_estimate",
					compositionConfirmedAt: null,
				}),
				row({
					id: "accepted",
					name: "Soup",
					compositionSource: accepted.compositionSource,
					compositionConfirmedAt: Math.floor(
						(accepted.compositionConfirmedAt ?? now).getTime() / 1000,
					),
				}),
			],
			rules: "current",
		});
		expect(accepted).toEqual({
			compositionSource: "user_override",
			compositionConfirmedAt: now,
		});
		expect(exportedIds(plan)).toEqual(["sync-accepted"]);
		expect(plan.samples.every((sample) => sample.foodName === "Soup")).toBe(
			true,
		);
		expect(plan.samples.some((sample) => "estimate" in sample)).toBe(false);
		expect(plan.excluded.aiEstimate).toBe(1);
		expect(plan.deletes).toEqual([]);
		expect(
			healthEstimateAcceptNeeded({
				healthExportEnabled: true,
				compositionSource: "ai_estimate",
				amountsEdited: false,
			}),
		).toBe(true);
		expect(
			healthEstimateAcceptNeeded({
				healthExportEnabled: false,
				compositionSource: "ai_estimate",
				amountsEdited: false,
			}),
		).toBe(false);
		expect(
			healthEstimateAcceptNeeded({
				healthExportEnabled: true,
				compositionSource: "ai_estimate",
				amountsEdited: true,
			}),
		).toBe(false);
		expect(
			healthEstimateAcceptNeeded({
				healthExportEnabled: true,
				compositionSource: "usda",
				amountsEdited: false,
			}),
		).toBe(false);
		expect(
			intakeCompositionAfterEstimate({
				compositionSource: "ai_estimate",
				amountsEdited: false,
				accepted: true,
			}),
		).toBe("user_override");
		expect(
			intakeCompositionAfterEstimate({
				compositionSource: "ai_estimate",
				amountsEdited: true,
				accepted: false,
			}),
		).toBe("user_override");
		expect(
			intakeCompositionAfterEstimate({
				compositionSource: "ai_estimate",
				amountsEdited: false,
				accepted: false,
			}),
		).toBe("ai_estimate");
	});

	it("leaves the legacy rule unchanged for iOS 1.6.39/1.6.40", () => {
		const plan = planHealthExport({
			...base,
			rows: everySource(),
			rules: "legacy",
		});
		expect(exportedIds(plan)).toEqual([
			"sync-usda",
			"sync-typed",
			"sync-override",
		]);
		expect(plan.samples.some((sample) => sample.estimate)).toBe(false);
		expect(plan.excluded).toEqual({
			aiEstimate: 1,
			unconfirmed: 1,
			notExportable: 2,
		});
		expect(plan.deletes).toEqual([]);
		// The default is the legacy rule.
		expect(planHealthExport({ ...base, rows: everySource() })).toEqual(plan);
	});

	it("excludes, counts, and fully deletes logs with unusable numbers", () => {
		const unusable = [
			row({ id: "zero", energyKcal: 0, proteinG: 0, carbsG: 0, fatG: 0 }),
			row({ id: "negative", proteinG: -1 }),
			row({ id: "nan", carbsG: Number.NaN }),
			row({ id: "null", fatG: null }),
			row({ id: "huge", energyKcal: 5001 }),
			row({ id: "macro", carbsG: 501, energyKcal: 2500 }),
			row({ id: "fiber", fiberG: 201, energyKcal: 2500 }),
			row({
				id: "atwater",
				energyKcal: 50,
				proteinG: 40,
				carbsG: 40,
				fatG: 10,
			}),
		];
		const plan = planHealthExport({
			...base,
			rows: [row({ id: "ok" }), ...unusable],
			rules: "current",
		});
		expect(exportedIds(plan)).toEqual(["sync-ok"]);
		expect(plan.excluded.notExportable).toBe(unusable.length);
		expect(plan.deletes.map((item) => item.healthSyncId)).toEqual(
			unusable.map((item) => item.healthSyncId),
		);
		expect(
			plan.deletes.every((item) => item.syncIdentifiers.length === 5),
		).toBe(true);
	});

	it("does not re-send a delete the cursor already holds", () => {
		const plan = planHealthExport({
			...base,
			rows: [row({ id: "zero", energyKcal: 0 })],
			cursor: { written: {}, deleted: ["sync-zero"] },
			rules: "current",
		});
		expect(plan.deletes).toEqual([]);
		expect(plan.excluded.notExportable).toBe(1);
	});

	it("never sends usability deletes to old clients", () => {
		const plan = planHealthExport({
			...base,
			rows: [
				row({ id: "zero", energyKcal: 0, proteinG: 0, carbsG: 0, fatG: 0 }),
			],
			rules: "legacy",
		});
		expect(plan.deletes).toEqual([]);
		// A confirmed usda 0 kcal line is still written under the old rule.
		expect(exportedIds(plan)).toEqual(["sync-zero"]);
	});

	it("counts a row without a sync id as notExportable", () => {
		const plan = planHealthExport({
			...base,
			rows: [
				row({ id: "legacy", healthSyncId: null, healthSyncVersion: null }),
			],
			rules: "current",
		});
		expect(plan.samples).toEqual([]);
		expect(plan.excluded).toEqual({
			aiEstimate: 0,
			unconfirmed: 0,
			notExportable: 1,
		});
	});

	it("removes a voided AI estimate and replaces an edited one without the marker", () => {
		const plan = planHealthExport({
			...base,
			rows: [
				row({ id: "gone", compositionSource: "ai_estimate", voidedAt: recent }),
				row({
					id: "old",
					healthSyncId: "sync-edit",
					compositionSource: "ai_estimate",
					voidedAt: recent,
				}),
				row({
					id: "new",
					healthSyncId: "sync-edit",
					healthSyncVersion: 2,
					compositionSource: "user_override",
					energyKcal: 250,
				}),
			],
			rules: "current",
		});
		expect(plan.deletes.map((item) => item.healthSyncId)).toEqual([
			"sync-gone",
		]);
		expect(plan.samples.every((sample) => sample.action === "replace")).toBe(
			true,
		);
		expect(plan.samples.every((sample) => sample.syncVersion === 2)).toBe(true);
		expect(plan.samples.some((sample) => sample.estimate)).toBe(false);
	});
});

describe("healthSampleUsable", () => {
	const ok = {
		energyKcal: 200,
		proteinG: 8,
		carbsG: 30,
		fatG: 5,
		fiberG: null,
	};

	it("accepts the edges and a missing fiber", () => {
		expect(healthSampleUsable(ok)).toBe(true);
		expect(healthSampleUsable({ ...ok, fiberG: undefined })).toBe(true);
		expect(
			healthSampleUsable({
				energyKcal: 5000,
				proteinG: 500,
				carbsG: 0,
				fatG: 0,
				fiberG: 200,
			}),
		).toBe(true);
		// 4p + 4c + 9f exactly 3x kcal + 100.
		expect(
			healthSampleUsable({
				energyKcal: 100,
				proteinG: 100,
				carbsG: 0,
				fatG: 0,
			}),
		).toBe(true);
	});

	it("rejects 0 kcal, out-of-range, non-finite, and Atwater-absurd numbers", () => {
		for (const patch of [
			{ energyKcal: 0 },
			{ energyKcal: -5 },
			{ energyKcal: 5000.5 },
			{ energyKcal: Number.POSITIVE_INFINITY },
			{ energyKcal: null },
			{ proteinG: 500.1 },
			{ carbsG: -0.1 },
			{ fatG: Number.NaN },
			{ fatG: undefined },
			{ fiberG: 200.5 },
			{ fiberG: -1 },
			{ energyKcal: 100, proteinG: 101, carbsG: 0, fatG: 0 },
		]) {
			expect(healthSampleUsable({ ...ok, ...patch })).toBe(false);
		}
	});
});

describe("healthExportRulesFor", () => {
	it("gives iOS 1.6.41+ and non-iOS callers the current rule", () => {
		expect(healthExportRulesFor(ios("1.6.40"))).toBe("legacy");
		expect(healthExportRulesFor(ios("1.6.39"))).toBe("legacy");
		expect(healthExportRulesFor(ios("1.6.41"))).toBe("current");
		expect(healthExportRulesFor(ios("1.7.0"))).toBe("current");
		expect(healthExportRulesFor({ clientPlatform: "ios" })).toBe("legacy");
		expect(healthExportRulesFor(webFlags)).toBe("current");
		expect(healthExportRulesFor({})).toBe("current");
	});
});

describe("Health pending: missing sync ids", () => {
	it("gives the caller's live rows an id on the iOS 1.6.41 full pull, once", async () => {
		const { database, sqlite } = setup();
		await grant(sqlite);
		await enable(database);
		const first = await getHealthExportPending(
			envFor(database),
			principal,
			ios("1.6.41"),
			{ now },
		);
		const ids = syncIds(sqlite);
		expect(ids.mine).toMatch(/^[0-9a-f-]{36}$/);
		expect(ids.mineVersion).toBe(1);
		expect(ids.voided).toBeNull();
		expect(ids.other).toBeNull();
		expect(first.samples.map((sample) => sample.healthSyncId)).toContain(
			ids.mine,
		);
		expect(first.excluded.notExportable).toBe(0);

		const second = await getHealthExportPending(
			envFor(database),
			principal,
			ios("1.6.41"),
			{ now },
		);
		expect(syncIds(sqlite)).toEqual(ids);
		expect(second.samples).toEqual(first.samples);
	});

	it("does not write for old clients, non-iOS callers, or a purge", async () => {
		for (const [flags, scope] of [
			[ios("1.6.40"), undefined],
			[webFlags, undefined],
			[ios("1.6.41"), "all"],
		] as const) {
			const { database, sqlite } = setup();
			await grant(sqlite);
			await enable(database);
			const pending = await getHealthExportPending(
				envFor(database),
				principal,
				flags,
				{ now, scope },
			);
			expect(syncIds(sqlite).mine).toBeNull();
			if (!scope) expect(pending.excluded.notExportable).toBeGreaterThan(0);
		}
	});

	it("does not write while export is off", async () => {
		const { database, sqlite } = setup();
		await grant(sqlite);
		const pending = await getHealthExportPending(
			envFor(database),
			principal,
			ios("1.6.41"),
			{ now },
		);
		expect(pending.status).toBe("off");
		expect(syncIds(sqlite).mine).toBeNull();
	});

	it("keeps the flag-off 403 for iOS 1.6.41", async () => {
		const { database, sqlite } = setup();
		await grant(sqlite);
		const error = await capture(() =>
			getHealthExportPending(
				envFor(database, () => false),
				principal,
				ios("1.6.41"),
				{ now },
			),
		);
		expect(codeOf(error)).toBe("FEATURE_DISABLED");
		expect(syncIds(sqlite).mine).toBeNull();
	});
});

function syncIds(sqlite: ReturnType<typeof createSqliteD1>["sqlite"]) {
	const read = (id: string) =>
		sqlite
			.prepare(
				"select health_sync_id id, health_sync_version version from nutrition_intake where id = ?",
			)
			.get(id) as { id: string | null; version: number | null };
	return {
		mine: read("mine").id,
		mineVersion: read("mine").version,
		voided: read("voided").id,
		other: read("other").id,
	};
}

async function enable(database: D1Database) {
	await setHealthExportPreference(envFor(database), principal, webFlags, {
		enabled: true,
		confirm: true,
		deviceStatus: "on",
	});
}

function setup() {
	const { database, sqlite } = createSqliteD1();
	databases.push(sqlite);
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
			fuel_date text,
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
			verified integer not null,
			created_at integer not null default 0
		);
	`);
	const insert = sqlite.prepare(
		`insert into nutrition_intake (
			id, user_id, organization_id, meal_name_snapshot, voided_at,
			health_sync_id, health_sync_version, composition_source,
			composition_confirmed_at, energy_kcal, protein_g, carbs_g, fat_g,
			fiber_g, occurred_at, verified, created_at
		) values (?, ?, 'org-1', 'Plate', ?, ?, ?, ?, null, 600, 30, 60, 20, null, ?, 1, ?)`,
	);
	// A Manifest-logged row from before 1.11.28: no sync id, meal source null.
	insert.run("mine", "user-a", null, null, null, null, recent, recent);
	insert.run("voided", "user-a", recent, null, null, null, recent, recent);
	insert.run("other", "user-b", null, null, null, null, recent, recent);
	insert.run(
		"tagged",
		"user-a",
		null,
		"sync-tagged",
		1,
		"meal",
		recent,
		recent,
	);
	return { database, sqlite };
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

describe("Fuel day estimate marker", () => {
	const base = {
		name: "Plate",
		energyKcal: 400,
		proteinG: 20,
		carbsG: 40,
		fatG: 10,
		occurredAt: new Date("2026-11-21T12:00:00Z"),
		slotType: null,
	};
	it("marks only AI estimates", () => {
		const items = selectPublishableFuelItems([
			{ ...base, id: "ai", estimate: true },
			{ ...base, id: "typed" },
			{ ...base, id: "null", estimate: null },
		]);
		expect(items.find((item) => item.id === "ai")?.estimate).toBe(true);
		expect(items.find((item) => item.id === "typed")).not.toHaveProperty(
			"estimate",
		);
		expect(items.find((item) => item.id === "null")).not.toHaveProperty(
			"estimate",
		);
	});
});
