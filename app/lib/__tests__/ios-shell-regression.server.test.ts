import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { patchUserSettings } from "~/lib/auth.server";
import {
	IMPORT_DISPATCH_DEADLINE_SECONDS,
	submitDurableRecipeImport,
	sweepImportDispatches,
} from "~/lib/import-dispatch.server";
import {
	getCalendarDates,
	getWeekStart,
	resolveManifestSupplyWindow,
} from "~/lib/manifest-dates";
import { confirmRecipeImport } from "~/lib/recipe-import-confirm.server";
import { FuelTimeZoneSchema } from "~/lib/schemas/fuel";
import { MobileSettingsPatchSchema } from "~/lib/schemas/mobile/auth";
import { createMockR2 } from "~/test/helpers/mock-env";
import { createSqliteD1 } from "~/test/helpers/sqlite-d1";
import {
	backfillFuelDateBatch,
	backfillFuelDatesBounded,
} from "../nutrition/fuel-backfill.server";
import { selectPublishableFuelItems } from "../nutrition/fuel-dto.server";
import { loadFuelDay } from "../nutrition/fuel-read.server";
import {
	D1_MAX_BOUND_PARAMS,
	D1_MAX_FUEL_DATE_BACKFILL_ROWS,
} from "../query-utils.server";
import {
	claimQueueJobForProcessing,
	QUEUE_JOB_LEASE_SECONDS,
	runIdempotentAiJob,
} from "../queue-job.server";

const fuelReadSource = readFileSync(
	new URL("../nutrition/fuel-read.server.ts", import.meta.url),
	"utf8",
);
const summarySource = readFileSync(
	new URL("../nutrition/service.server.ts", import.meta.url),
	"utf8",
);

function shellDb() {
	const { database, sqlite } = createSqliteD1();
	sqlite.exec(`
CREATE TABLE user (
  id TEXT PRIMARY KEY,
  settings TEXT,
  tier TEXT,
  tier_expires_at INTEGER
);
CREATE TABLE organization (
  id TEXT PRIMARY KEY,
  name TEXT,
  credits INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE ledger (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  user_id TEXT,
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  idempotency_key TEXT
);
CREATE UNIQUE INDEX ledger_idempotency_key_uidx ON ledger (idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE TABLE import_dispatch (
  request_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  job_type TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  payload_json TEXT,
  state TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER,
  ledger_idempotency_key TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
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
  expires_at INTEGER NOT NULL,
  processing_owner TEXT,
  processing_lease_expires_at INTEGER
);
CREATE TABLE nutrition_intake (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  organization_id TEXT,
  manifest_date TEXT,
  fuel_date TEXT,
  voided_at INTEGER,
  occurred_at INTEGER,
  energy_kcal REAL,
  protein_g REAL,
  carbs_g REAL,
  fat_g REAL,
  fiber_g REAL,
  coverage REAL,
  nutrients_json TEXT,
  entry_id TEXT,
  slot_type TEXT,
  servings REAL,
  meal_id TEXT,
  meal_name_snapshot TEXT,
  organization_name_snapshot TEXT,
  verified INTEGER,
  notes TEXT,
  logged_amount REAL,
  logged_unit TEXT
);
CREATE TABLE meal (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  name TEXT NOT NULL,
  domain TEXT,
  type TEXT,
  description TEXT,
  directions TEXT,
  equipment TEXT,
  servings INTEGER,
  prep_time INTEGER,
  cook_time INTEGER,
  custom_fields TEXT,
  nutrition TEXT,
  nutrition_revision INTEGER DEFAULT 0,
  nutrition_computed_revision INTEGER DEFAULT 0,
  nutrition_status TEXT DEFAULT 'current',
  nutrition_updated_at INTEGER,
  created_at INTEGER,
  updated_at INTEGER,
  import_request_id TEXT
);
CREATE UNIQUE INDEX meal_import_request_uidx ON meal (import_request_id)
  WHERE import_request_id IS NOT NULL;
CREATE TABLE meal_ingredient (
  id TEXT PRIMARY KEY,
  meal_id TEXT,
  name TEXT,
  quantity REAL,
  unit TEXT,
  is_optional INTEGER,
  order_index INTEGER,
  note TEXT,
  base_quantity REAL,
  base_unit TEXT
);
CREATE TABLE meal_tag (meal_id TEXT, tag_id TEXT);
CREATE TABLE tag (id TEXT PRIMARY KEY, name TEXT, slug TEXT, organization_id TEXT, color TEXT, category TEXT, created_by TEXT, created_at INTEGER);
CREATE TABLE organization_name (id TEXT PRIMARY KEY, name TEXT);
CREATE TABLE nutrition_goal (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  daily_energy_kcal REAL,
  protein_g REAL,
  carbs_g REAL,
  fat_g REAL,
  fiber_g REAL,
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  consent_at INTEGER NOT NULL,
  consent_id TEXT,
  created_at INTEGER
);
CREATE TABLE nutrition_fuel_day (
  user_id TEXT NOT NULL,
  fuel_date TEXT NOT NULL,
  used INTEGER NOT NULL
);
`);
	return { database, sqlite };
}

describe("atomic settings merge", () => {
	it("merges nested manifest settings and deletes explicit null", async () => {
		const { database, sqlite } = shellDb();
		sqlite.prepare("INSERT INTO user (id, settings) VALUES (?, ?)").run(
			"user-1",
			JSON.stringify({
				aiConsentAt: "2026-01-01T00:00:00.000Z",
				allergens: ["milk"],
				manifestSettings: {
					weekStart: "sunday",
					showSnackSlot: true,
					defaultSlots: ["breakfast"],
					calendarSpan: 5,
				},
				fuelTimeZone: "America/New_York",
			}),
		);
		sqlite
			.prepare("INSERT INTO user (id, settings) VALUES (?, ?)")
			.run("user-2", JSON.stringify({ manifestSettings: { calendarSpan: 3 } }));

		const merged = await patchUserSettings(database, "user-1", {
			manifestSettings: { calendarSpan: 1 },
		});
		expect(merged.manifestSettings).toEqual({
			weekStart: "sunday",
			showSnackSlot: true,
			defaultSlots: ["breakfast"],
			calendarSpan: 1,
		});
		expect(merged.fuelTimeZone).toBe("America/New_York");

		const omitted = await patchUserSettings(database, "user-1", {
			manifestSettings: { weekStart: "monday" },
		});
		expect(omitted.manifestSettings?.calendarSpan).toBe(1);
		expect(omitted.manifestSettings?.weekStart).toBe("monday");

		const replaced = await patchUserSettings(database, "user-1", {
			allergens: ["soybeans"],
		});
		expect(replaced.allergens).toEqual(["soybeans"]);

		const cleared = await patchUserSettings(database, "user-1", {
			aiConsentAt: null,
		});
		expect(cleared.aiConsentAt).toBeUndefined();
		expect(cleared.fuelTimeZone).toBe("America/New_York");

		const other = sqlite
			.prepare("SELECT settings FROM user WHERE id = ?")
			.get("user-2") as { settings: string };
		expect(JSON.parse(other.settings).manifestSettings.calendarSpan).toBe(3);
	});

	it("keeps unrelated keys when hub, fuel, diary, and manifest patches land", async () => {
		const { database, sqlite } = shellDb();
		sqlite
			.prepare("INSERT INTO user (id, settings) VALUES ('user-1', '{}')")
			.run();
		await patchUserSettings(database, "user-1", {
			hubLayout: {
				widgets: [{ id: "hub-stats", order: 0, visible: true }],
			},
			fuelTimeZone: "Europe/Dublin",
			diaryLayout: "slots",
			manifestSettings: { calendarSpan: 5, weekStart: "sunday" },
		});
		await patchUserSettings(database, "user-1", {
			hubLayout: {
				widgets: [{ id: "hub-stats", order: 1, visible: false }],
			},
		});
		await patchUserSettings(database, "user-1", {
			fuelTimeZone: "America/Chicago",
		});
		await patchUserSettings(database, "user-1", { diaryLayout: "timeline" });
		const next = await patchUserSettings(database, "user-1", {
			manifestSettings: { calendarSpan: 1 },
		});
		expect(next.hubLayout).toEqual({
			widgets: [{ id: "hub-stats", order: 1, visible: false }],
		});
		expect(next.fuelTimeZone).toBe("America/Chicago");
		expect(next.diaryLayout).toBe("timeline");
		expect(next.manifestSettings).toMatchObject({
			calendarSpan: 1,
			weekStart: "sunday",
		});
	});

	it("rejects an unknown settings key before D1", () => {
		expect(
			MobileSettingsPatchSchema.safeParse({
				manifestSettings: { calendarSpan: 1, showSnackSlot: true },
			}).success,
		).toBe(false);
		expect(
			MobileSettingsPatchSchema.safeParse({ notASetting: true }).success,
		).toBe(false);
		expect(
			MobileSettingsPatchSchema.safeParse({
				manifestSettings: { calendarSpan: 1 },
			}).success,
		).toBe(true);
	});
});

describe("manifest span defaults", () => {
	it("keeps an absent web span at 5 and a Sunday week on Sunday", () => {
		const absent = resolveManifestSupplyWindow(null, "2026-11-18");
		expect(absent).toEqual({ startDate: "2026-11-18", endDate: "2026-11-22" });
		const sunday = getWeekStart("2026-11-18", "sunday");
		expect(sunday).toBe("2026-11-15");
		const week = getCalendarDates(7, sunday, "sunday");
		expect(week[0]).toBe("2026-11-15");
		expect(week[6]).toBe("2026-11-21");
		const monday = resolveManifestSupplyWindow(
			{ manifestSettings: { weekStart: "monday", calendarSpan: 7 } },
			"2026-11-18",
		);
		expect(monday.startDate).toBe("2026-11-16");
		expect(monday.endDate).toBe("2026-11-22");
	});
});

describe("fuel reads", () => {
	it("does not backfill on the request path", () => {
		expect(fuelReadSource).not.toContain("backfillFuelDates");
		expect(summarySource).not.toContain("backfillFuelDates");
	});

	it("does not privately launch the host from the share extension", () => {
		const files = [
			"ios/RationShare/ShareViewController.swift",
			"ios/RationShare/ShareImportView.swift",
			"ios/Shared/ShareImport/ShareImportCoordinator.swift",
			"ios/Shared/ShareImport/ShareImportClient.swift",
			"ios/Shared/ShareImport/ShareImportModels.swift",
		];
		const source = files.map((file) => readFileSync(file, "utf8")).join("\n");
		expect(source).not.toContain("unsafeBitCast");
		expect(source).not.toContain("NSSelectorFromString");
		expect(source).not.toContain("UIApplication");
		expect(source).not.toContain("scheduledTimer");
		expect(source).not.toContain("asyncAfter");
		expect(source).not.toContain('title = "Open Ration"');
		expect(source).toContain("if !flagOn");
		const client = readFileSync(
			"ios/Shared/ShareImport/ShareImportClient.swift",
			"utf8",
		);
		expect(client).not.toContain("UserDefaults");
		expect(client).toContain("X-Ration-Client");
		expect(client).toContain("CFBundleShortVersionString");
	});

	it("includes a legacy null fuel date and skips a malformed row", async () => {
		const { database, sqlite } = shellDb();
		sqlite
			.prepare("INSERT INTO user (id, settings, tier) VALUES (?, ?, 'free')")
			.run(
				"user-1",
				JSON.stringify({ manifestSettings: { weekStart: "sunday" } }),
			);
		sqlite
			.prepare(
				`INSERT INTO nutrition_goal (
				   id, user_id, daily_energy_kcal, protein_g, carbs_g, fat_g,
				   effective_from, consent_at
				 ) VALUES ('g1', 'user-1', 2000, 100, 200, 70, '2026-01-01', 1)`,
			)
			.run();
		const occurred = Math.floor(Date.parse("2026-11-13T15:00:00.000Z") / 1000);
		sqlite
			.prepare(
				`INSERT INTO nutrition_intake (
				   id, user_id, manifest_date, fuel_date, occurred_at,
				   energy_kcal, protein_g, carbs_g, fat_g, meal_name_snapshot
				 ) VALUES (?, 'user-1', '2026-11-13', '2026-11-13', ?, 100, 10, 12, 4, 'Oats')`,
			)
			.run("row-good", occurred);
		sqlite
			.prepare(
				`INSERT INTO nutrition_intake (
				   id, user_id, manifest_date, fuel_date, occurred_at,
				   energy_kcal, protein_g, carbs_g, fat_g, meal_name_snapshot, notes
				 ) VALUES ('row-legacy', 'user-1', '2026-11-13', NULL, ?, 50, 5, 6, 2, 'Legacy secret name', 'private note')`,
			)
			.run(occurred);
		sqlite
			.prepare(
				`INSERT INTO nutrition_intake (
				   id, user_id, manifest_date, fuel_date, occurred_at,
				   energy_kcal, protein_g, carbs_g, fat_g, meal_name_snapshot, notes
				 ) VALUES ('row-bad', 'user-1', '2026-11-13', '2026-11-13', ?, NULL, 1, 1, 1, 'Should not log', 'note')`,
			)
			.run(occurred);

		const day = await loadFuelDay(
			database,
			"user-1",
			"2026-11-13",
			new Date("2026-11-13T12:00:00.000Z"),
		);
		expect(day.goal?.dailyEnergyKcal).toBe(2000);
		expect(day.items.map((item) => item.id).sort()).toEqual([
			"row-bad",
			"row-good",
			"row-legacy",
		]);
		const warnings: unknown[] = [];
		const publishedAt = new Date("2026-11-13T15:00:00.000Z");
		const template = day.items.find((item) => item.id === "row-good");
		expect(template).toBeTruthy();
		const published = selectPublishableFuelItems(
			[
				{
					...template!,
					id: "row-good",
					occurredAt: publishedAt,
					energyKcal: 100,
					proteinG: 10,
					carbsG: 12,
					fatG: 4,
				},
				{
					...template!,
					id: "row-legacy",
					occurredAt: publishedAt,
					energyKcal: 50,
					proteinG: 5,
					carbsG: 6,
					fatG: 2,
				},
				{
					...template!,
					id: "row-bad",
					occurredAt: publishedAt,
					energyKcal: Number.NaN,
					proteinG: 1,
					carbsG: 1,
					fatG: 1,
				},
			],
			(diagnostic) => {
				warnings.push(diagnostic);
			},
		);
		expect(published.map((item) => item.id).sort()).toEqual([
			"row-good",
			"row-legacy",
		]);
		expect(published.every((item) => Number.isFinite(item.energyKcal))).toBe(
			true,
		);
		expect(published[0]?.occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
		const bad = selectPublishableFuelItems(
			[
				...day.items,
				{
					id: "bad",
					mealName: "Secret food",
					notes: "secret note",
					energyKcal: Number.NaN,
					proteinG: 1,
					carbsG: 1,
					fatG: 1,
					occurredAt: new Date("not-a-date"),
					slotType: null,
				},
			],
			(diagnostic) => warnings.push(diagnostic),
		);
		expect(bad.find((item) => item.id === "bad")).toBeUndefined();
		expect(JSON.stringify(warnings)).not.toContain("Secret");
		expect(JSON.stringify(warnings)).not.toContain("note");
		expect(JSON.stringify(warnings)).toContain("malformed_fuel_row");
	});

	it("publishes amount and unit, and notes only when asked", () => {
		const occurredAt = new Date("2026-11-11T15:00:00.000Z");
		const source = {
			id: "row-1",
			mealName: "eggs",
			notes: "leftovers",
			energyKcal: 347,
			proteinG: 20,
			carbsG: 2,
			fatG: 4,
			occurredAt,
			slotType: "lunch" as string | null,
			servings: 1.5,
			loggedAmount: 180,
			loggedUnit: "g",
		};
		const hidden = selectPublishableFuelItems([source]);
		expect(hidden[0]).toMatchObject({
			servings: 1.5,
			loggedAmount: 180,
			loggedUnit: "g",
		});
		expect(hidden[0]).not.toHaveProperty("notes");
		expect(JSON.stringify(hidden)).not.toContain("leftovers");

		const shown = selectPublishableFuelItems([source], () => {}, {
			includeNotes: true,
		});
		expect(shown[0]?.notes).toBe("leftovers");

		const blank = selectPublishableFuelItems(
			[{ ...source, notes: "   " }],
			() => {},
			{ includeNotes: true },
		);
		expect(blank[0]?.notes).toBeNull();

		const warnings: unknown[] = [];
		const bad = selectPublishableFuelItems(
			[
				{
					...source,
					id: "bad",
					mealName: "Secret food",
					notes: "secret note",
					energyKcal: Number.NaN,
				},
			],
			(diagnostic) => warnings.push(diagnostic),
		);
		expect(bad.find((item) => item.id === "bad")).toBeUndefined();
		expect(JSON.stringify(warnings)).not.toContain("Secret");
		expect(JSON.stringify(warnings)).not.toContain("note");
	});

	it("keeps Timeline and standing Void off Fuel, and the setting in Settings", () => {
		const fuel = readFileSync(
			"ios/Ration/Features/Fuel/FuelView.swift",
			"utf8",
		);
		const settings = readFileSync(
			"ios/Ration/Features/Settings/SettingsView.swift",
			"utf8",
		);
		const swipes = readFileSync(
			"ios/Ration/Core/Design/ListSwipeActions.swift",
			"utf8",
		);
		expect(fuel).not.toContain("Day layout");
		expect(fuel).not.toContain('Text("Timeline")');
		expect(fuel).not.toContain('Text("Slots")');
		expect(fuel).not.toContain('Button("Void")');
		expect(fuel).not.toContain('Button("Edit")');
		expect(fuel).toContain("fuelLogSwipeActions");
		expect(fuel).toContain("NutritionGoalsView()");
		expect(fuel).toContain("FuelLogDetailView");
		expect(settings).toContain("Day layout");
		expect(settings).toContain("diaryLayout");
		expect(swipes).toContain("allowsFullSwipe: false");
		expect(swipes).toContain('Label("Edit"');
		expect(swipes).toContain('Label("Delete"');
	});

	it("drains fuel dates in bounded idempotent rounds", async () => {
		expect(D1_MAX_FUEL_DATE_BACKFILL_ROWS).toBeLessThanOrEqual(
			D1_MAX_BOUND_PARAMS,
		);
		expect(D1_MAX_FUEL_DATE_BACKFILL_ROWS).toBeLessThanOrEqual(99);
		const { database, sqlite } = shellDb();
		const insert = sqlite.prepare(
			"INSERT INTO nutrition_intake (id, user_id, manifest_date, fuel_date) VALUES (?, 'user-1', '2026-11-13', NULL)",
		);
		for (let i = 0; i < 120; i++) insert.run(`id-${i}`);
		const first = await backfillFuelDateBatch(database, 10_000);
		expect(first).toBe(D1_MAX_FUEL_DATE_BACKFILL_ROWS);
		const drained = await backfillFuelDatesBounded(database, { maxRounds: 5 });
		expect(drained).toBe(120 - D1_MAX_FUEL_DATE_BACKFILL_ROWS);
		expect(await backfillFuelDatesBounded(database)).toBe(0);
		const filled = sqlite
			.prepare(
				"SELECT count(*) AS n FROM nutrition_intake WHERE fuel_date = manifest_date",
			)
			.get() as { n: number };
		expect(filled.n).toBe(120);
	});
});

describe("import dispatch", () => {
	function envFor(database: D1Database) {
		const send = vi.fn().mockResolvedValue(undefined);
		return {
			env: {
				DB: database,
				STORAGE: createMockR2(),
				IMPORT_URL_QUEUE: { send },
			} as unknown as Cloudflare.Env,
			send,
		};
	}

	it("debits once, replays without a second charge, and rejects a hash mismatch", async () => {
		const { database, sqlite } = shellDb();
		sqlite
			.prepare("INSERT INTO organization (id, credits) VALUES ('org-1', 9)")
			.run();
		const requestId = "11111111-1111-4111-8111-111111111111";
		const input = {
			userId: "user-1",
			organizationId: "org-1",
			clientRequestId: requestId,
			url: "https://example.com/recipe",
			sourceKind: "web" as const,
			hasPhoto: false,
		};
		const first = await submitDurableRecipeImport(envFor(database).env, input);
		expect(first).toEqual({ status: "processing", requestId });
		const credits = sqlite
			.prepare("SELECT credits FROM organization WHERE id = 'org-1'")
			.get() as { credits: number };
		expect(credits.credits).toBe(6);
		const ledgers = sqlite
			.prepare("SELECT count(*) AS n FROM ledger")
			.get() as { n: number };
		expect(ledgers.n).toBe(1);

		const { env: replayEnv, send } = envFor(database);
		const replay = await submitDurableRecipeImport(replayEnv, input);
		expect(replay.requestId).toBe(requestId);
		expect(send).not.toHaveBeenCalled();
		const creditsAfter = sqlite
			.prepare("SELECT credits FROM organization WHERE id = 'org-1'")
			.get() as { credits: number };
		expect(creditsAfter.credits).toBe(6);

		await expect(
			submitDurableRecipeImport(envFor(database).env, {
				...input,
				url: "https://example.com/other",
			}),
		).rejects.toMatchObject({ init: { status: 409 } });
		await expect(
			submitDurableRecipeImport(envFor(database).env, {
				...input,
				userId: "other-user",
			}),
		).rejects.toMatchObject({ init: { status: 404 } });
	});

	it("does not refund a failed queue send before the deadline", async () => {
		const { database, sqlite } = shellDb();
		sqlite
			.prepare("INSERT INTO organization (id, credits) VALUES ('org-1', 9)")
			.run();
		const send = vi.fn().mockRejectedValue(new Error("queue down"));
		const env = {
			DB: database,
			STORAGE: createMockR2(),
			IMPORT_URL_QUEUE: { send },
		} as unknown as Cloudflare.Env;
		await submitDurableRecipeImport(env, {
			userId: "user-1",
			organizationId: "org-1",
			clientRequestId: "22222222-2222-4222-8222-222222222222",
			url: "https://example.com/recipe",
			sourceKind: "web",
			hasPhoto: false,
		});
		const state = sqlite.prepare("SELECT state FROM import_dispatch").get() as {
			state: string;
		};
		expect(state.state).toBe("debited");
		const credits = sqlite
			.prepare("SELECT credits FROM organization WHERE id = 'org-1'")
			.get() as { credits: number };
		expect(credits.credits).toBe(6);
		const swept = await sweepImportDispatches(env, new Date());
		expect(swept).toBeGreaterThan(0);
		const still = sqlite
			.prepare("SELECT credits FROM organization WHERE id = 'org-1'")
			.get() as { credits: number };
		expect(still.credits).toBe(6);
	});

	it("refunds a pending job once at the dispatch deadline and leaves a live lease", async () => {
		const { database, sqlite } = shellDb();
		sqlite
			.prepare("INSERT INTO organization (id, credits) VALUES ('org-1', 3)")
			.run();
		const now = new Date("2026-11-13T12:00:00.000Z");
		const requestId = "33333333-3333-4333-8333-333333333333";
		sqlite
			.prepare(
				`INSERT INTO import_dispatch (
				   request_id, organization_id, user_id, job_type, content_hash, state,
				   attempts, created_at, updated_at, payload_json, ledger_idempotency_key
				 ) VALUES (?, 'org-1', 'user-1', 'import_url', 'abc', 'debited', 1, ?, ?, '{"url":"https://example.com/recipe","sourceKind":"web","cost":3}', ?)`,
			)
			.run(
				requestId,
				Math.floor(now.getTime() / 1000) - IMPORT_DISPATCH_DEADLINE_SECONDS - 1,
				Math.floor(now.getTime() / 1000),
				`import-debit:${requestId}`,
			);
		sqlite
			.prepare(
				`INSERT INTO queue_job (
				   request_id, job_type, organization_id, user_id, status, created_at, expires_at
				 ) VALUES (?, 'import_url', 'org-1', 'user-1', 'pending', ?, ?)`,
			)
			.run(
				requestId,
				Math.floor(now.getTime() / 1000),
				Math.floor(now.getTime() / 1000) + 3600,
			);
		const env = {
			DB: database,
			STORAGE: createMockR2(),
			IMPORT_URL_QUEUE: { send: vi.fn() },
		} as unknown as Cloudflare.Env;
		await sweepImportDispatches(env, now);
		const job = sqlite
			.prepare("SELECT status, result_json FROM queue_job WHERE request_id = ?")
			.get(requestId) as { status: string; result_json: string };
		expect(job.status).toBe("failed");
		expect(job.result_json).toContain("dispatch_failed");
		const credits = sqlite
			.prepare("SELECT credits FROM organization WHERE id = 'org-1'")
			.get() as { credits: number };
		expect(credits.credits).toBe(6);
		await sweepImportDispatches(env, now);
		const creditsAgain = sqlite
			.prepare("SELECT credits FROM organization WHERE id = 'org-1'")
			.get() as { credits: number };
		expect(creditsAgain.credits).toBe(6);

		const liveId = "44444444-4444-4444-8444-444444444444";
		sqlite
			.prepare(
				`INSERT INTO import_dispatch (
				   request_id, organization_id, user_id, job_type, content_hash, state,
				   attempts, created_at, updated_at
				 ) VALUES (?, 'org-1', 'user-1', 'import_url', 'abc', 'debited', 0, ?, ?)`,
			)
			.run(
				liveId,
				Math.floor(now.getTime() / 1000) - IMPORT_DISPATCH_DEADLINE_SECONDS - 5,
				Math.floor(now.getTime() / 1000),
			);
		sqlite
			.prepare(
				`INSERT INTO queue_job (
				   request_id, job_type, organization_id, user_id, status, created_at, expires_at,
				   processing_lease_expires_at
				 ) VALUES (?, 'import_url', 'org-1', 'user-1', 'processing', ?, ?, ?)`,
			)
			.run(
				liveId,
				Math.floor(now.getTime() / 1000),
				Math.floor(now.getTime() / 1000) + 3600,
				Math.floor(now.getTime() / 1000) + QUEUE_JOB_LEASE_SECONDS,
			);
		await sweepImportDispatches(env, now);
		const live = sqlite
			.prepare("SELECT status FROM queue_job WHERE request_id = ?")
			.get(liveId) as { status: string };
		expect(live.status).toBe("processing");
		expect(
			(
				sqlite
					.prepare("SELECT credits FROM organization WHERE id = 'org-1'")
					.get() as { credits: number }
			).credits,
		).toBe(6);
	});
});

describe("queue lease", () => {
	it("skips a live lease and recovers an expired one without a second model call", async () => {
		const { database, sqlite } = shellDb();
		const now = new Date("2026-11-13T12:00:00.000Z");
		sqlite
			.prepare(
				`INSERT INTO queue_job (
				   request_id, job_type, organization_id, user_id, status, created_at, expires_at,
				   processing_owner, processing_lease_expires_at, model_artifact
				 ) VALUES ('job-1', 'import_url', 'org-1', 'user-1', 'processing', ?, ?, 'owner', ?, 'artifact')`,
			)
			.run(
				Math.floor(now.getTime() / 1000),
				Math.floor(now.getTime() / 1000) + 3600,
				Math.floor(now.getTime() / 1000) + 30,
			);
		const work = vi.fn();
		const live = await runIdempotentAiJob(database, "job-1", work);
		expect(live).toEqual({ ran: false, reason: "leased" });
		expect(work).not.toHaveBeenCalled();

		sqlite
			.prepare(
				"UPDATE queue_job SET processing_lease_expires_at = ? WHERE request_id = 'job-1'",
			)
			.run(Math.floor(now.getTime() / 1000) - 5);
		const claimed = await claimQueueJobForProcessing(
			database,
			"job-1",
			new Date(now.getTime() + 60_000),
		);
		expect(claimed).toBe(true);
	});
});

describe("import confirm", () => {
	it("returns the same meal for a repeated confirm", async () => {
		const { database, sqlite } = shellDb();
		const requestId = "55555555-5555-4555-8555-555555555555";
		const expires = Math.floor(Date.now() / 1000) + 3600;
		sqlite
			.prepare(
				`INSERT INTO queue_job (
				   request_id, job_type, organization_id, user_id, status, result_json, created_at, expires_at
				 ) VALUES (?, 'import_url', 'org-1', 'user-1', 'completed', ?, ?, ?)`,
			)
			.run(
				requestId,
				JSON.stringify({
					status: "completed",
					success: true,
					sourceUrl: "https://example.com/recipe",
					extractedRecipe: {
						name: "Soup",
						domain: "food",
						ingredients: [],
						tags: [],
					},
				}),
				expires - 10,
				expires,
			);
		sqlite
			.prepare(
				`INSERT INTO meal (id, organization_id, name, import_request_id, nutrition_revision, nutrition_computed_revision, nutrition_status)
				 VALUES ('meal-1', 'org-1', 'Soup', ?, 0, 0, 'current')`,
			)
			.run(requestId);
		const first = await confirmRecipeImport(
			{ DB: database } as Cloudflare.Env,
			{ organizationId: "org-1", requestId, userId: "user-1" },
		);
		const second = await confirmRecipeImport(
			{ DB: database } as Cloudflare.Env,
			{ organizationId: "org-1", requestId, userId: "user-1" },
		);
		expect(first.meal.id).toBe("meal-1");
		expect(second.meal.id).toBe("meal-1");
		const count = sqlite.prepare("SELECT count(*) AS n FROM meal").get() as {
			n: number;
		};
		expect(count.n).toBe(1);
		await expect(
			confirmRecipeImport({ DB: database } as Cloudflare.Env, {
				organizationId: "org-1",
				requestId,
				userId: "other",
			}),
		).rejects.toMatchObject({ init: { status: 404 } });
	});
});

describe("fuel zone", () => {
	it("rejects GMT and does not require a zone to name a day", () => {
		expect(FuelTimeZoneSchema.safeParse("GMT").success).toBe(false);
		expect(FuelTimeZoneSchema.safeParse("GMT+0").success).toBe(false);
		expect(FuelTimeZoneSchema.safeParse("Europe/Dublin").success).toBe(true);
	});
});
