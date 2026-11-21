import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { getClientSafeFlags } from "~/lib/feature-flags/flags.server";
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
	planHealthPurge,
	samplesSafeToWrite,
} from "../health-export";
import {
	clearHealthExport,
	getHealthExportPending,
	HEALTH_EXPORT_SINCE_ROW_CAP,
	HEALTH_EXPORT_SYNC_OVERLAP_MS,
	parseHealthPendingQuery,
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

describe("health export plan: edits, removals, and exclusions", () => {
	const base = {
		viewerUserId: "user-a",
		activeOrganizationId: "org-1",
		crossKitchen: false,
	};

	it("works without a cursor", () => {
		const plan = planHealthExport({
			...base,
			rows: [row({ id: "food-1", healthSyncId: "sync-1" })],
		});
		expect(plan.samples).toHaveLength(4);
		expect(plan.excluded).toEqual({
			aiEstimate: 0,
			unconfirmed: 0,
			notExportable: 0,
		});
	});

	it("an edit replaces the samples and never deletes the live line", () => {
		const plan = planHealthExport({
			...base,
			rows: [
				row({
					id: "food-1",
					healthSyncId: "sync-1",
					healthSyncVersion: 1,
					voidedAt: recent,
					fiberG: 3,
				}),
				row({
					id: "food-2",
					healthSyncId: "sync-1",
					healthSyncVersion: 2,
					energyKcal: 200,
				}),
			],
		});
		expect(new Set(plan.samples.map((sample) => sample.action))).toEqual(
			new Set(["replace"]),
		);
		expect(plan.samples.every((sample) => sample.syncVersion === 2)).toBe(true);
		expect(plan.samples[0]?.value).toBe(200);
		expect(plan.samples.every((sample) => sample.intakeId === "food-2")).toBe(
			true,
		);
		// Only the nutrient the edit cleared is deleted.
		expect(plan.deletes).toEqual([
			{
				action: "delete",
				healthSyncId: "sync-1",
				syncIdentifiers: ["ration:sync-1:dietaryFiber"],
			},
		]);
	});

	it("does not delete a voided id that a live row outside the window still carries", () => {
		const plan = planHealthExport({
			...base,
			rows: [row({ id: "food-1", healthSyncId: "sync-1", voidedAt: recent })],
			liveSyncIds: new Set(["sync-1"]),
		});
		expect(plan.deletes).toEqual([]);
		expect(plan.samples).toEqual([]);
	});

	it("deletes a removal once and keeps it deleted after the cursor advances", () => {
		const plan = planHealthExport({
			...base,
			rows: [
				row({ id: "food-1", healthSyncId: "sync-1", voidedAt: recent }),
				row({ id: "food-0", healthSyncId: "sync-1", voidedAt: recent }),
			],
		});
		expect(plan.deletes.map((item) => item.healthSyncId)).toEqual(["sync-1"]);
		expect(plan.deletes[0]?.syncIdentifiers).toHaveLength(5);
	});

	it("keeps the highest version when two live rows share an id", () => {
		const plan = planHealthExport({
			...base,
			rows: [
				row({
					id: "food-3",
					healthSyncId: "sync-1",
					healthSyncVersion: 3,
					energyKcal: 300,
				}),
				row({
					id: "food-2",
					healthSyncId: "sync-1",
					healthSyncVersion: 2,
					energyKcal: 200,
				}),
			],
		});
		const energy = plan.samples.filter(
			(sample) => sample.quantityType === "dietaryEnergyConsumed",
		);
		expect(energy).toHaveLength(1);
		expect(energy[0]?.value).toBe(300);
		expect(energy[0]?.syncVersion).toBe(3);
	});

	it("removes an exported line from Health when an edit makes it an AI estimate", () => {
		const plan = planHealthExport({
			...base,
			rows: [
				row({ id: "food-1", healthSyncId: "sync-1", voidedAt: recent }),
				row({
					id: "food-2",
					healthSyncId: "sync-1",
					healthSyncVersion: 2,
					compositionSource: "ai_estimate",
					compositionConfirmedAt: null,
				}),
			],
		});
		expect(plan.samples).toEqual([]);
		expect(plan.deletes.map((item) => item.syncIdentifiers.length)).toEqual([
			5,
		]);
		expect(plan.excluded.aiEstimate).toBe(1);
	});

	it("counts what it kept out of Health, by reason", () => {
		const plan = planHealthExport({
			...base,
			rows: [
				row({ id: "usda", healthSyncId: "sync-usda" }),
				row({
					id: "ai",
					healthSyncId: "sync-ai",
					compositionSource: "ai_estimate",
				}),
				row({
					id: "pending",
					healthSyncId: "sync-pending",
					compositionSource: "barcode",
					compositionConfirmedAt: null,
				}),
				row({
					id: "meal",
					healthSyncId: "sync-meal",
					compositionSource: "meal",
				}),
				row({ id: "legacy", healthSyncId: null }),
				row({ id: "gone", healthSyncId: "sync-gone", voidedAt: recent }),
				row({ id: "other", userId: "user-b", compositionSource: "meal" }),
			],
		});
		expect(plan.excluded).toEqual({
			aiEstimate: 1,
			unconfirmed: 1,
			notExportable: 2,
		});
	});

	it("does not move a stale-nutrient delete into the deleted cursor", () => {
		const cursor = advanceHealthCursor(
			{ written: { "sync-1": 1 }, deleted: [] },
			{
				samples: [],
				deletes: [
					{
						action: "delete",
						healthSyncId: "sync-1",
						syncIdentifiers: ["ration:sync-1:dietaryFiber"],
					},
				],
			},
		);
		expect(cursor).toEqual({ written: { "sync-1": 1 }, deleted: [] });
	});

	it("purges every id the person has in any kitchen and nobody else's", () => {
		const deletes = planHealthPurge({
			rows: [
				row({ id: "a", healthSyncId: "sync-a" }),
				row({ id: "b", healthSyncId: "sync-b", organizationId: "org-2" }),
				row({ id: "c", healthSyncId: "sync-a", voidedAt: recent }),
				row({
					id: "d",
					healthSyncId: "sync-ai",
					compositionSource: "ai_estimate",
				}),
				row({ id: "e", healthSyncId: "sync-other", userId: "user-b" }),
				row({ id: "f", healthSyncId: null }),
			],
			viewerUserId: "user-a",
			extraSyncIds: ["sync-old", " ", "sync-a"],
		});
		expect(deletes.map((item) => item.healthSyncId)).toEqual([
			"sync-a",
			"sync-b",
			"sync-ai",
			"sync-old",
		]);
		expect(deletes.every((item) => item.syncIdentifiers.length === 5)).toBe(
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
	it("returns only rows changed since the last sync, with a trailing syncedThrough", async () => {
		const { database, sqlite } = setup();
		await grant(sqlite);
		await enable(database);
		const since = new Date(now.getTime() - 60 * 60 * 1000);
		sqlite
			.prepare("update nutrition_intake set created_at = ?")
			.run(Math.floor((since.getTime() - 60_000) / 1000));
		insertIntake(sqlite, {
			id: "fresh",
			sync: "sync-fresh",
			source: "usda",
			confirmed: recent,
		});
		const pending = await getHealthExportPending(
			envFor(database),
			principal,
			webFlags,
			{ since, now },
		);
		expect(
			new Set(pending.samples.map((sample) => sample.healthSyncId)),
		).toEqual(new Set(["sync-fresh"]));
		// sync-void was voided "recent", which is after since.
		expect(pending.deletes.map((item) => item.healthSyncId)).toEqual([
			"sync-void",
		]);
		expect(pending.truncated).toBe(false);
		expect(pending.purge).toBe(false);
		expect(pending.syncedThrough).toBe(
			new Date(now.getTime() - HEALTH_EXPORT_SYNC_OVERLAP_MS).toISOString(),
		);
	});

	it("keeps a line in Health when its voided row is newer than the live row", async () => {
		const { database, sqlite } = setup();
		await grant(sqlite);
		await enable(database);
		const since = new Date(now.getTime() - 60 * 60 * 1000);
		const before = Math.floor((since.getTime() - 60_000) / 1000);
		sqlite.prepare("update nutrition_intake set created_at = ?").run(before);
		insertIntake(sqlite, {
			id: "kept-live",
			sync: "sync-kept",
			source: "usda",
			confirmed: recent,
			version: 2,
			created: before,
		});
		insertIntake(sqlite, {
			id: "kept-old",
			sync: "sync-kept",
			source: "usda",
			confirmed: recent,
			voided: recent,
			created: before,
		});
		const pending = await getHealthExportPending(
			envFor(database),
			principal,
			webFlags,
			{ since, now },
		);
		expect(pending.deletes.map((item) => item.healthSyncId)).not.toContain(
			"sync-kept",
		);
	});

	it("says truncated and plans nothing when an incremental pull is too large", async () => {
		const { database, sqlite } = setup();
		await grant(sqlite);
		await enable(database);
		for (let index = 0; index <= HEALTH_EXPORT_SINCE_ROW_CAP; index += 1) {
			insertIntake(sqlite, {
				id: `bulk-${index}`,
				sync: `sync-bulk-${index}`,
				source: "usda",
				confirmed: recent,
			});
		}
		const pending = await getHealthExportPending(
			envFor(database),
			principal,
			webFlags,
			{ since: new Date(now.getTime() - 60_000), now },
		);
		expect(pending.truncated).toBe(true);
		expect(pending.samples).toEqual([]);
		expect(pending.deletes).toEqual([]);
		const full = await getHealthExportPending(
			envFor(database),
			principal,
			webFlags,
			{ now },
		);
		expect(full.truncated).toBe(false);
		expect(full.samples.length).toBeGreaterThan(
			HEALTH_EXPORT_SINCE_ROW_CAP * 4,
		);
	});

	it("reports exclusions on a full pull", async () => {
		const { database, sqlite } = setup();
		await grant(sqlite);
		await enable(database);
		const pending = await getHealthExportPending(
			envFor(database),
			principal,
			webFlags,
			{ now },
		);
		expect(pending.excluded).toEqual({
			aiEstimate: 1,
			unconfirmed: 0,
			notExportable: 1,
		});
	});

	it("purges every Ration sample with scope all, even while export is off", async () => {
		const { database, sqlite } = setup();
		await grant(sqlite);
		const pending = await getHealthExportPending(
			envFor(database),
			principal,
			webFlags,
			{ scope: "all", now },
		);
		expect(pending.purge).toBe(true);
		expect(pending.samples).toEqual([]);
		expect(pending.enabled).toBe(false);
		const ids = pending.deletes.map((item) => item.healthSyncId);
		expect(new Set(ids)).toEqual(
			new Set([
				"sync-usda",
				"sync-ai",
				"sync-meal",
				"sync-kitchen",
				"sync-void",
			]),
		);
		expect(ids).not.toContain("sync-other");
	});

	it("still purges with scope all after intake consent is withdrawn, but nothing else", async () => {
		const { database, sqlite } = setup();
		await grant(sqlite);
		sqlite.prepare("update nutrition_consent set withdrawn_at = 2").run();
		const purge = await getHealthExportPending(
			envFor(database),
			principal,
			webFlags,
			{ scope: "all", now },
		);
		expect(purge.purge).toBe(true);
		expect(purge.samples).toEqual([]);
		expect(purge.deletes.length).toBeGreaterThan(0);
		const changes = await capture(() =>
			getHealthExportPending(envFor(database), principal, webFlags, { now }),
		);
		expect(codeOf(changes)).toBe("nutrition_consent_required");
	});

	it("purges after Remove Ration data and lowers the request once the device is done", async () => {
		const { database, sqlite } = setup();
		await grant(sqlite);
		await enable(database);
		await clearHealthExport(envFor(database), principal, webFlags, {
			confirm: true,
		});
		const pending = await getHealthExportPending(
			envFor(database),
			principal,
			webFlags,
			{ now },
		);
		expect(pending.purge).toBe(true);
		expect(pending.clearRequested).toBe(true);
		expect(pending.samples).toEqual([]);
		expect(pending.deletes.length).toBeGreaterThan(0);
		sqlite.prepare("update nutrition_consent set withdrawn_at = 2").run();
		const done = await clearHealthExport(
			envFor(database),
			principal,
			webFlags,
			{ confirm: true, completed: true },
		);
		expect(done.clearRequested).toBe(false);
		const settings = sqlite
			.prepare("select settings from user where id = 'user-a'")
			.get() as { settings: string };
		expect(JSON.parse(settings.settings).healthExport.clearRequested).toBe(
			false,
		);
	});

	it("fails closed for iOS below 1.6.39 and opens at 1.6.39", async () => {
		const { database, sqlite } = setup();
		await grant(sqlite);
		const old = await capture(() =>
			getHealthExportPending(
				envFor(database),
				principal,
				{ userId: "user-a", clientPlatform: "ios", clientVersion: "1.6.38" },
				{ now },
			),
		);
		expect(codeOf(old)).toBe("FEATURE_DISABLED");
		const missing = await capture(() =>
			getHealthExportPending(
				envFor(database),
				principal,
				{ userId: "user-a", clientPlatform: "ios" },
				{ now },
			),
		);
		expect(codeOf(missing)).toBe("FEATURE_DISABLED");
		const current = await getHealthExportPending(
			envFor(database),
			principal,
			{ userId: "user-a", clientPlatform: "ios", clientVersion: "1.6.39" },
			{ now },
		);
		expect(current.status).toBe("off");
	});

	it("hides the client flag from iOS below 1.6.39", async () => {
		const { database } = setup();
		const old = await getClientSafeFlags(envFor(database), {
			userId: "user-a",
			clientPlatform: "ios",
			clientVersion: "1.6.38",
		});
		expect(old.nutritionHealthExport).toBe(false);
		const current = await getClientSafeFlags(envFor(database), {
			userId: "user-a",
			clientPlatform: "ios",
			clientVersion: "1.6.39",
		});
		expect(current.nutritionHealthExport).toBe(true);
		const web = await getClientSafeFlags(envFor(database), webFlags);
		expect(web.nutritionHealthExport).toBe(true);
	});

	it("parses since and scope, and refuses a bad scope or a future since", () => {
		const at = (query: string) =>
			new Request(`https://ration.test/api/x?${query}`);
		expect(parseHealthPendingQuery(at(""), now)).toEqual({
			since: undefined,
			scope: undefined,
		});
		expect(
			parseHealthPendingQuery(
				at("since=2026-11-09T11:00:00.000Z&scope=changes"),
				now,
			),
		).toEqual({
			since: new Date("2026-11-09T11:00:00.000Z"),
			scope: "changes",
		});
		expect(parseHealthPendingQuery(at("scope=all"), now).scope).toBe("all");
		for (const query of [
			"scope=everything",
			"since=yesterday",
			"since=2026-11-10T12:00:00.000Z",
		]) {
			expect(() => parseHealthPendingQuery(at(query), now)).toThrow();
		}
	});
});

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
		version?: number;
		created?: number;
	},
) {
	sqlite
		.prepare(
			`insert into nutrition_intake (
				id, user_id, organization_id, meal_name_snapshot, voided_at,
				health_sync_id, health_sync_version, composition_source,
				composition_confirmed_at, energy_kcal, protein_g, carbs_g, fat_g,
				fiber_g, occurred_at, verified, created_at
			) values (?, ?, ?, 'Yogurt', ?, ?, ?, ?, ?, 120, 10, 8, 4, null, ?, ?, ?)`,
		)
		.run(
			input.id,
			input.userId ?? "user-a",
			input.organizationId ?? "org-1",
			input.voided ?? null,
			input.sync,
			input.version ?? 1,
			input.source,
			input.confirmed,
			input.occurred ?? recent,
			input.verified ?? 0,
			input.created ?? recent,
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
