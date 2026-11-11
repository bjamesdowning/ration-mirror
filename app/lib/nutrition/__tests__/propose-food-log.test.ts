import { afterEach, describe, expect, it, vi } from "vitest";
import { getNutritionConsentStatement } from "~/lib/nutrition/consent-policy";
import { lookupSupplyBarcode } from "~/lib/supply-barcode.server";
import { createMockKV } from "~/test/helpers/mock-env";
import { createSqliteD1 } from "~/test/helpers/sqlite-d1";
import { lookupFoodBarcode } from "../food-barcode.server";
import { healthExportAllowed } from "../health-exportability";
import {
	FoodLogCapabilityError,
	type FoodLogLine,
	proposeFoodLog,
} from "../propose-food-log.server";

vi.mock("~/lib/supply-barcode.server", () => ({
	lookupSupplyBarcode: vi.fn(),
}));

const databases: Array<ReturnType<typeof createSqliteD1>["sqlite"]> = [];

afterEach(() => {
	for (const sqlite of databases) sqlite.close();
	databases.length = 0;
});

const line: FoodLogLine = {
	name: "Yogurt",
	energyKcal: 100,
	proteinG: 8,
	carbsG: 12,
	fatG: 3,
	fiberG: null,
	amount: 1,
	unit: "serving",
	barcode: null,
	fdcId: null,
	compositionSource: "ai_estimate",
};

function setup() {
	const { database, sqlite } = createSqliteD1();
	databases.push(sqlite);
	sqlite.exec(`
		create table organization (
			id text primary key,
			name text not null,
			metadata text,
			created_at integer not null,
			credits integer not null
		);
		create table ledger (
			id text primary key,
			organization_id text not null,
			user_id text,
			amount integer not null,
			reason text not null,
			idempotency_key text,
			created_at integer
		);
		create table cargo (
			id text primary key,
			organization_id text not null,
			name text not null,
			quantity real not null,
			unit text not null,
			nutrition text
		);
		create table supply_item (
			id text primary key,
			name text not null
		);
		create table nutrition_intake (
			id text primary key,
			fuel_date text
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
		create table nutrition_food_draft (
			id text primary key,
			user_id text not null,
			organization_id text,
			organization_name_snapshot text,
			operation_id text not null,
			subject text not null,
			lines_json text,
			credits integer not null,
			created_at integer not null
		);
		insert into organization (id, name, created_at, credits)
			values ('org-1', 'Kitchen', 0, 10);
		insert into cargo (id, organization_id, name, quantity, unit, nutrition)
			values (
				'cargo-1', 'org-1', 'Yogurt', 1, 'cup',
				'{"source":"user_override","energyKcal":90}'
			);
	`);
	return { database, sqlite };
}

async function grant(sqlite: ReturnType<typeof setup>["sqlite"]) {
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
	flags: (key: string) => boolean = () => true,
): Env {
	return {
		DB: database,
		RATION_KV: createMockKV(),
		USDA_FDC_API_KEY: "test-key",
		FLAGS: {
			getBooleanValue: async (key: string) => flags(key),
		},
	} as unknown as Env;
}

const principal = {
	userId: "user-a",
	organizationId: "org-1",
	surface: "web" as const,
	authMethod: "session",
};

const webFlags = { userId: "user-a", clientPlatform: "web" as const };

function credits(sqlite: ReturnType<typeof setup>["sqlite"]) {
	return (
		sqlite.prepare("select credits as n from organization").get() as {
			n: number;
		}
	).n;
}

function count(
	sqlite: ReturnType<typeof setup>["sqlite"],
	table: string,
): number {
	return (
		sqlite.prepare(`select count(*) as n from ${table}`).get() as { n: number }
	).n;
}

describe("propose food log", () => {
	it("stores a draft and does not write intake, cargo, or supply", async () => {
		const { database, sqlite } = setup();
		await grant(sqlite);
		const model = vi.fn(async () => [line]);
		const result = await proposeFoodLog(envFor(database), principal, webFlags, {
			operationKey: "11111111-1111-4111-8111-111111111111",
			photoRef: "photo-a",
			model,
		});
		expect(result.intakeId).toBeNull();
		expect(result.credits).toBe(2);
		expect(result.lines[0]?.compositionSource).toBe("ai_estimate");
		expect(
			healthExportAllowed({
				compositionSource: result.lines[0]?.compositionSource,
				compositionConfirmedAt: new Date(),
			}),
		).toBe(false);
		expect(credits(sqlite)).toBe(8);
		expect(count(sqlite, "nutrition_intake")).toBe(0);
		expect(count(sqlite, "supply_item")).toBe(0);
		expect(count(sqlite, "nutrition_food_draft")).toBe(1);
		expect(
			sqlite.prepare("select nutrition from cargo where id = 'cargo-1'").get(),
		).toEqual({ nutrition: '{"source":"user_override","energyKcal":90}' });
		expect(lookupSupplyBarcode).not.toHaveBeenCalled();
		expect(model).toHaveBeenCalledTimes(1);
	});

	it("replays a completed key without debiting again", async () => {
		const { database, sqlite } = setup();
		await grant(sqlite);
		const model = vi.fn(async () => [line]);
		const input = {
			operationKey: "22222222-2222-4222-8222-222222222222",
			photoRef: "photo-b",
			model,
		};
		const env = envFor(database);
		const first = await proposeFoodLog(env, principal, webFlags, input);
		const second = await proposeFoodLog(env, principal, webFlags, input);
		expect(second.replayed).toBe(true);
		expect(second.draftId).toBe(first.draftId);
		expect(credits(sqlite)).toBe(8);
		expect(model).toHaveBeenCalledTimes(1);
		expect(count(sqlite, "ledger")).toBe(1);
	});

	it("refunds once when the gateway throws", async () => {
		const { database, sqlite } = setup();
		await grant(sqlite);
		const model = vi.fn(async () => {
			throw new Error("gateway down");
		});
		await expect(
			proposeFoodLog(envFor(database), principal, webFlags, {
				operationKey: "33333333-3333-4333-8333-333333333333",
				photoRef: "photo-c",
				model,
			}),
		).rejects.toThrow("gateway down");
		expect(credits(sqlite)).toBe(10);
		const reasons = sqlite
			.prepare("select reason from ledger order by reason")
			.all() as Array<{ reason: string }>;
		expect(reasons.map((row) => row.reason)).toEqual([
			"Food log photo",
			"Refund: Food log photo",
		]);
		expect(count(sqlite, "nutrition_food_draft")).toBe(0);
		expect(count(sqlite, "nutrition_intake")).toBe(0);
		expect(
			sqlite.prepare("select status from nutrition_operation").get(),
		).toEqual({ status: "failed" });
	});

	it("does not debit when no photo reference is present", async () => {
		const { database, sqlite } = setup();
		await grant(sqlite);
		const model = vi.fn(async () => [line]);
		await expect(
			proposeFoodLog(envFor(database), principal, webFlags, {
				operationKey: "44444444-4444-4444-8444-444444444444",
				photoRef: "  ",
				model,
			}),
		).rejects.toBeInstanceOf(FoodLogCapabilityError);
		expect(credits(sqlite)).toBe(10);
		expect(count(sqlite, "nutrition_operation")).toBe(0);
		expect(model).not.toHaveBeenCalled();
	});

	it("does not call a food catalogue for a meal or loose produce", async () => {
		const { database, sqlite } = setup();
		await grant(sqlite);
		const fetchImpl = vi.fn(async () => {
			throw new Error("external food api");
		});
		const model = vi.fn(async () => [line]);
		for (const [subject, operationKey] of [
			["meal", "55555555-5555-4555-8555-555555555555"],
			["loose_produce", "66666666-6666-4666-8666-666666666666"],
		] as const) {
			const result = await proposeFoodLog(
				envFor(database),
				principal,
				webFlags,
				{
					operationKey,
					photoRef: `photo-${subject}`,
					subject,
					barcode: "012345678905",
					model,
					fetchImpl: fetchImpl as typeof fetch,
				},
			);
			expect(result.intakeId).toBeNull();
		}
		expect(fetchImpl).not.toHaveBeenCalled();
		expect(lookupSupplyBarcode).not.toHaveBeenCalled();
	});

	it("leaves a cargo override unchanged after a same-name barcode miss", async () => {
		const { database, sqlite } = setup();
		await grant(sqlite);
		const fetchImpl = vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						foods: [
							{
								fdcId: 9,
								description: "Yogurt",
								dataType: "Branded",
								gtinUpc: "999",
								foodNutrients: [{ nutrientId: 1008, value: 1 }],
							},
						],
					}),
					{ status: 200 },
				),
		);
		const miss = await lookupFoodBarcode(
			envFor(database),
			"012345678905",
			fetchImpl as typeof fetch,
		);
		expect(miss.found).toBe(false);
		expect(fetchImpl).toHaveBeenCalledTimes(1);
		await proposeFoodLog(envFor(database), principal, webFlags, {
			operationKey: "77777777-7777-4777-8777-777777777777",
			photoRef: "photo-yogurt",
			model: async () => [line],
		});
		expect(
			sqlite.prepare("select nutrition from cargo where id = 'cargo-1'").get(),
		).toEqual({ nutrition: '{"source":"user_override","energyKcal":90}' });
		expect(count(sqlite, "supply_item")).toBe(0);
		expect(credits(sqlite)).toBe(8);
	});

	it("does not call the model when the photo flag or iOS 1.5 is closed", async () => {
		const { database, sqlite } = setup();
		await grant(sqlite);
		const model = vi.fn(async () => [line]);
		await expect(
			proposeFoodLog(
				envFor(database, (key) => key !== "nutrition-photo-log"),
				principal,
				webFlags,
				{
					operationKey: "88888888-8888-4888-8888-888888888888",
					photoRef: "photo-off",
					model,
				},
			),
		).rejects.toBeTruthy();
		await expect(
			proposeFoodLog(
				envFor(database),
				principal,
				{
					userId: "user-a",
					clientPlatform: "ios",
					clientVersion: "1.5.18",
				},
				{
					operationKey: "99999999-9999-4999-8999-999999999999",
					photoRef: "photo-old",
					model,
				},
			),
		).rejects.toBeTruthy();
		expect(model).not.toHaveBeenCalled();
		expect(credits(sqlite)).toBe(10);
		expect(count(sqlite, "nutrition_operation")).toBe(0);
	});
});
