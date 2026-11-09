import { afterEach, describe, expect, it, vi } from "vitest";
import { getNutritionConsentStatement } from "~/lib/nutrition/consent-policy";
import { createSqliteD1 } from "~/test/helpers/sqlite-d1";
import { action as mobileLog } from "../mobile/v1.nutrition.diary";
import { action as mobileSaved } from "../mobile/v1.nutrition.saved-food";
import { action as webLog } from "../nutrition.diary";
import { action as webPatch } from "../nutrition.diary.$id";
import { action as webKitchen } from "../nutrition.diary.$id.save-to-kitchen";
import { loader as webExport } from "../nutrition.diary.export";
import { action as webQuote } from "../nutrition.diary.quote";
import { loader as webSavedList } from "../nutrition.saved-food";

const auth = vi.hoisted(() => ({ userId: "user-a", groupId: "org-1" }));

vi.mock("~/lib/auth.server", () => ({
	requireActiveGroup: vi.fn(async () => ({
		groupId: auth.groupId,
		session: { user: { id: auth.userId } },
	})),
}));

vi.mock("~/lib/rate-limiter.server", () => ({
	checkRateLimit: vi.fn(async () => ({
		allowed: true,
		remaining: 10,
		resetAt: Date.now() + 60_000,
	})),
	rateLimitResponse: vi.fn(),
}));

const databases: Array<ReturnType<typeof createSqliteD1>["sqlite"]> = [];

afterEach(() => {
	for (const database of databases.splice(0)) database.close();
	auth.userId = "user-a";
	auth.groupId = "org-1";
});

const OP = "11111111-1111-4111-8111-111111111111";
const ITEM = "22222222-2222-4222-8222-222222222222";
const OP_2 = "33333333-3333-4333-8333-333333333333";
const ITEM_2 = "44444444-4444-4444-8444-444444444444";

function setup(metadata: string | null = null) {
	const { database, sqlite } = createSqliteD1();
	databases.push(sqlite);
	sqlite.exec(`
		create table organization (
			id text primary key,
			name text not null,
			metadata text
		);
		create table meal_plan (
			id text primary key,
			organization_id text not null
		);
		create table meal (
			id text primary key,
			organization_id text not null,
			name text not null,
			domain text not null default 'food',
			type text not null default 'recipe',
			servings integer default 1,
			created_at integer,
			updated_at integer
		);
		create table meal_plan_entry (
			id text primary key,
			plan_id text not null,
			meal_id text not null,
			date text not null
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
			created_at integer,
			updated_at integer
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
			organization_id text,
			user_id text not null,
			plan_id text,
			entry_id text,
			meal_id text,
			organization_name_snapshot text,
			meal_name_snapshot text,
			manifest_date text not null,
			slot_type text,
			servings real not null,
			energy_kcal real not null,
			protein_g real not null,
			carbs_g real not null,
			fat_g real not null,
			coverage real not null,
			source text not null,
			confidence real not null,
			verified integer not null default 0,
			occurred_at integer not null,
			kitchen_event_id text,
			schema_version integer not null default 1,
			nutrients_json text,
			coverage_json text,
			fiber_g real,
			consent_id text,
			idempotency_key text,
			operation_id text,
			replaces_intake_id text,
			void_operation_id text,
			voided_at integer,
			voided_by_user_id text,
			notes text,
			logged_amount real,
			logged_unit text,
			health_sync_id text,
			health_sync_version integer,
			composition_source text,
			composition_confirmed_at integer,
			fdc_id text,
			barcode text,
			saved_food_id text,
			created_at integer not null
		);
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
		create unique index nutrition_intake_user_idempotency_uidx
			on nutrition_intake(user_id, idempotency_key)
			where idempotency_key is not null;
		create table nutrition_operation (
			id text primary key,
			user_id text not null,
			organization_id text not null,
			operation_key text not null,
			request_hash text not null,
			operation_type text not null,
			status text not null,
			item_count integer not null,
			result_json text,
			created_at integer not null,
			completed_at integer,
			undone_at integer,
			unique(user_id, operation_key)
		);
		create table nutrition_access_audit (
			id text primary key,
			event_version integer not null default 1,
			user_id text,
			organization_id text,
			surface text not null,
			auth_method text not null,
			credential_id text,
			client_id text,
			event_type text not null,
			required_scope text,
			consent_purpose text,
			consent_policy_version text,
			outcome text not null,
			error_code text,
			replayed integer not null default 0,
			item_count_bucket text,
			date_range_bucket text,
			request_id text not null,
			operation_id text,
			duration_bucket text,
			occurred_at integer not null
		);
	`);
	const metaSql =
		metadata == null ? "null" : `'${metadata.replaceAll("'", "''")}'`;
	sqlite.exec(`
		insert into organization (id, name, metadata) values ('org-1', 'Test Kitchen', ${metaSql});
		insert into cargo (id, organization_id, name, quantity, unit) values ('cargo-1', 'org-1', 'Oats', 4, 'g');
	`);
	return { database, sqlite };
}

function context(database: D1Database, flagOn: boolean) {
	return {
		cloudflare: {
			env: {
				DB: database,
				RATION_KV: {} as KVNamespace,
				RATION_ENV: "test",
				FLAGS: { getBooleanValue: async () => flagOn },
			},
		},
	} as never;
}

async function grantIntake(
	sqlite: ReturnType<typeof createSqliteD1>["sqlite"],
	userId: string,
) {
	const statement = await getNutritionConsentStatement("intake");
	const now = Math.floor(Date.now() / 1000);
	sqlite.exec(`
		insert into nutrition_consent (
			id, user_id, purpose, policy_version, statement_version, statement_sha256,
			privacy_notice_version, source, granted_at, created_at
		) values (
			'${crypto.randomUUID()}', '${userId}', 'intake', '${statement.policyVersion}',
			'${statement.statementVersion}', '${statement.sha256}',
			'${statement.privacyNoticeVersion}', 'web', ${now}, ${now}
		);
	`);
}

function body(overrides: Record<string, unknown> = {}) {
	return {
		name: "Yogurt",
		macros: { energyKcal: 120, proteinG: 10, carbsG: 8, fatG: 4, fiberG: null },
		idempotencyKey: ITEM,
		operationKey: OP,
		amount: 150,
		unit: "g",
		occurredAt: "2026-06-21T22:30:00.000Z",
		...overrides,
	};
}

function post(url: string, payload: unknown, headers?: HeadersInit) {
	return new Request(url, {
		method: "POST",
		headers: { "Content-Type": "application/json", ...headers },
		body: JSON.stringify(payload),
	});
}

async function call(handler: (args: never) => Promise<unknown>, args: unknown) {
	try {
		return await handler(args as never);
	} catch (error) {
		return error;
	}
}

function statusOf(result: unknown): number | undefined {
	if (result instanceof Response) return result.status;
	if (!result || typeof result !== "object") return undefined;
	const record = result as { init?: { status?: number }; status?: number };
	return record.init?.status ?? record.status;
}

function codeOf(result: unknown): string | undefined {
	if (!result || typeof result !== "object") return undefined;
	const record = result as {
		data?: { code?: string };
		code?: string;
	};
	return record.data?.code ?? record.code;
}

function count(database: D1Database, sql: string) {
	return database.prepare(sql).first<{ n: number; quantity: number | null }>();
}

describe("personal diary route contract", () => {
	it("rejects a missing consent, a flag off, and iOS 1.5.15", async () => {
		const { database, sqlite } = setup();
		const denied = await call(webLog, {
			request: post("https://ration.test/api/nutrition/diary", body()),
			context: context(database, true),
		});
		expect(statusOf(denied)).toBe(403);
		expect(codeOf(denied)).toBe("nutrition_consent_required");

		await grantIntake(sqlite, "user-a");
		const flagged = await call(webLog, {
			request: post("https://ration.test/api/nutrition/diary", body()),
			context: context(database, false),
		});
		expect(statusOf(flagged)).toBe(403);
		expect(codeOf(flagged)).toBe("FEATURE_DISABLED");

		const ios = await call(mobileLog, {
			request: post(
				"https://ration.test/api/mobile/v1/nutrition/diary",
				body(),
				{ "X-Ration-Client": "ios/1.5.15" },
			),
			context: context(database, true),
		});
		expect(statusOf(ios)).toBe(403);
		expect(codeOf(ios)).toBe("FEATURE_DISABLED");
		expect(
			(await count(database, "select count(*) as n from nutrition_intake"))?.n,
		).toBe(0);
	});

	it("replays one row, leaves cargo and the plan alone, and hides other people", async () => {
		const { database, sqlite } = setup();
		await grantIntake(sqlite, "user-a");
		await grantIntake(sqlite, "user-b");
		const ctx = context(database, true);
		const first = await call(webLog, {
			request: post("https://ration.test/api/nutrition/diary", body()),
			context: ctx,
		});
		expect(statusOf(first)).toBeUndefined();
		const intakeId = (first as { intakeId: string; entryId: null }).intakeId;
		expect((first as { entryId: null }).entryId).toBeNull();

		const replay = await call(webLog, {
			request: post("https://ration.test/api/nutrition/diary", body()),
			context: ctx,
		});
		expect((replay as { intakeId: string; replayed: boolean }).intakeId).toBe(
			intakeId,
		);
		expect((replay as { replayed: boolean }).replayed).toBe(true);
		expect(
			(await count(database, "select count(*) as n from nutrition_intake"))?.n,
		).toBe(1);

		const conflict = await call(webLog, {
			request: post(
				"https://ration.test/api/nutrition/diary",
				body({ name: "Different yogurt" }),
			),
			context: ctx,
		});
		expect(statusOf(conflict)).toBe(409);
		expect(codeOf(conflict)).toBe("idempotency_conflict");
		expect(
			(await count(database, "select count(*) as n from nutrition_intake"))?.n,
		).toBe(1);

		const cargo = await count(
			database,
			"select count(*) as n, sum(quantity) as quantity from cargo",
		);
		expect(cargo?.n).toBe(1);
		expect(cargo?.quantity).toBe(4);
		expect(
			(await count(database, "select count(*) as n from meal_plan_entry"))?.n,
		).toBe(0);
		expect((await count(database, "select count(*) as n from meal"))?.n).toBe(
			0,
		);

		auth.userId = "user-b";
		const hidden = await call(webPatch, {
			request: new Request(
				`https://ration.test/api/nutrition/diary/${intakeId}`,
				{
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(
						body({
							operationKey: OP_2,
							idempotencyKey: ITEM_2,
							name: "Stolen",
						}),
					),
				},
			),
			context: ctx,
			params: { id: intakeId },
		});
		expect(statusOf(hidden)).toBe(404);
		expect(codeOf(hidden)).toBe("not_found");
		expect(
			(
				await database
					.prepare(
						"select meal_name_snapshot as name from nutrition_intake where id = ?",
					)
					.bind(intakeId)
					.first<{ name: string }>()
			)?.name,
		).toBe("Yogurt");

		const saved = await call(webKitchen, {
			request: post(
				`https://ration.test/api/nutrition/diary/${intakeId}/save-to-kitchen`,
				{ confirm: false, target: "cargo", operationKey: OP_2 },
			),
			context: ctx,
			params: { id: intakeId },
		});
		expect(statusOf(saved)).toBe(400);
		expect(codeOf(saved)).toBe("confirmation_required");
		expect((await count(database, "select count(*) as n from cargo"))?.n).toBe(
			1,
		);
		expect((await count(database, "select count(*) as n from meal"))?.n).toBe(
			0,
		);

		auth.userId = "user-a";
		const exported = await call(webExport, {
			request: new Request("https://ration.test/api/nutrition/diary/export"),
			context: ctx,
		});
		expect(exported).toBeInstanceOf(Response);
		const payload = (await (exported as Response).json()) as {
			intakes: Array<{ id: string }>;
		};
		expect(payload.intakes.map((row) => row.id)).toEqual([intakeId]);

		auth.userId = "user-b";
		const other = await call(webLog, {
			request: post(
				"https://ration.test/api/nutrition/diary",
				body({
					name: "Other",
					operationKey: "55555555-5555-4555-8555-555555555555",
					idempotencyKey: "66666666-6666-4666-8666-666666666666",
				}),
			),
			context: ctx,
		});
		expect((other as { intakeId?: string }).intakeId).toBeTruthy();
		auth.userId = "user-a";
		const onlyCaller = await call(webExport, {
			request: new Request("https://ration.test/api/nutrition/diary/export"),
			context: ctx,
		});
		const callerPayload = (await (onlyCaller as Response).json()) as {
			intakes: Array<{ id: string; name: string | null }>;
		};
		expect(callerPayload.intakes).toHaveLength(1);
		expect(callerPayload.intakes[0]?.name).toBe("Yogurt");

		const quote = await call(webQuote, {
			request: post("https://ration.test/api/nutrition/diary/quote", {}),
			context: ctx,
		});
		expect(quote).toEqual({ credits: 0 });
	});

	it("keeps Europe/Dublin just before local midnight on that kitchen date", async () => {
		const { database, sqlite } = setup(
			JSON.stringify({ supplySettings: { timeZone: "Europe/Dublin" } }),
		);
		await grantIntake(sqlite, "user-a");
		const logged = await call(webLog, {
			request: post("https://ration.test/api/nutrition/diary", body()),
			context: context(database, true),
		});
		expect((logged as { manifestDate: string }).manifestDate).toBe(
			"2026-06-21",
		);
	});

	it("uses UTC when the kitchen has no zone", async () => {
		const { database, sqlite } = setup(null);
		await grantIntake(sqlite, "user-a");
		const logged = await call(webLog, {
			request: post(
				"https://ration.test/api/nutrition/diary",
				body({ occurredAt: "2026-06-21T23:30:00.000Z" }),
			),
			context: context(database, true),
		});
		expect((logged as { manifestDate: string }).manifestDate).toBe(
			"2026-06-21",
		);
	});

	it("copies a saved food onto the intake row and hides another member", async () => {
		const { database, sqlite } = setup();
		await grantIntake(sqlite, "user-a");
		await grantIntake(sqlite, "user-b");
		const savedId = "55555555-5555-4555-8555-555555555555";
		const now = Math.floor(Date.now() / 1000);
		sqlite.exec(`
			insert into nutrition_saved_food (
				id, user_id, name, energy_kcal, protein_g, carbs_g, fat_g,
				default_amount, default_unit, created_at, updated_at
			) values (
				'${savedId}', 'user-a', 'Yogurt', 90, 8, 6, 3, 1, 'serving', ${now}, ${now}
			);
		`);
		const ctx = context(database, true);
		const logged = await call(webLog, {
			request: post(
				"https://ration.test/api/nutrition/diary",
				body({
					savedFoodId: savedId,
					name: "Not the saved name",
					macros: {
						energyKcal: 999,
						proteinG: 1,
						carbsG: 1,
						fatG: 1,
						fiberG: null,
					},
				}),
			),
			context: ctx,
		});
		expect(statusOf(logged)).toBeUndefined();
		const row = await database
			.prepare(
				"select meal_name_snapshot as name, energy_kcal as kcal, saved_food_id as savedFoodId, voided_at as voidedAt from nutrition_intake",
			)
			.first<{
				name: string;
				kcal: number;
				savedFoodId: string;
				voidedAt: number | null;
			}>();
		expect(row).toEqual({
			name: "Yogurt",
			kcal: 90,
			savedFoodId: savedId,
			voidedAt: null,
		});

		auth.userId = "user-b";
		const hidden = await call(webSavedList, {
			request: new Request("https://ration.test/api/nutrition/saved-food"),
			context: ctx,
		});
		expect(hidden).toEqual({ savedFoods: [] });

		const ios = await call(mobileSaved, {
			request: post(
				"https://ration.test/api/mobile/v1/nutrition/saved-food",
				{
					name: "Stolen",
					amount: 1,
					unit: "serving",
					macros: { energyKcal: 1, proteinG: 1, carbsG: 1, fatG: 1 },
				},
				{ "X-Ration-Client": "ios/1.5.18" },
			),
			context: context(database, true),
		});
		expect(statusOf(ios)).toBe(403);
		expect(codeOf(ios)).toBe("FEATURE_DISABLED");
		expect(
			(await count(database, "select count(*) as n from nutrition_saved_food"))
				?.n,
		).toBe(1);
	});
});
