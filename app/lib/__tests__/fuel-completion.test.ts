import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { McpToolContext } from "~/lib/mcp/auth";
import { createFoodLogToolDefs } from "~/lib/mcp/tools/food-log";
import {
	DiaryFoodNotFoundError,
	logDiaryFood,
	updateDiaryFood,
	voidDiaryFood,
} from "~/lib/nutrition/diary.server";
import { postFoodBarcode, postFuelPhoto } from "~/lib/nutrition/diary-http.server";
import { assertNutritionPhotoLog } from "~/lib/nutrition/fast-log-flag.server";
import { isNutritionFuelPageEnabled } from "~/lib/nutrition/fast-log-flag.server";
import { lookupFoodBarcode } from "~/lib/nutrition/food-barcode.server";
import { readFuelUsed } from "~/lib/nutrition/fuel-cap.server";
import { fuelDateForInstant } from "~/lib/nutrition/fuel-date";
import {
	FuelDailyLimitError,
	FuelPhotoTooLargeError,
	FuelTimezoneRequiredError,
} from "~/lib/nutrition/fuel-errors";
import {
	collapseFuelPhotoLines,
	confirmFuelPhoto,
	FUEL_PHOTO_PROMPT,
	readFuelPhoto,
	runFuelPhotoConsumerJob,
	submitFuelPhoto,
} from "~/lib/nutrition/fuel-photo.server";
import { FUEL_PHOTO_MAX_BYTES } from "~/lib/schemas/fuel";
import { InsufficientCreditsError } from "~/lib/ledger.server";
import type { NutritionPrincipal } from "~/lib/nutrition/service.server";
import { createSqliteD1 } from "~/test/helpers/sqlite-d1";

vi.mock("~/lib/feature-flags/flags.server", () => ({
	isFeatureEnabled: vi.fn(async () => false),
}));

vi.mock("~/lib/nutrition/fast-log-flag.server", () => ({
	assertNutritionFastLog: vi.fn(),
	assertNutritionFuelPage: vi.fn(),
	assertNutritionPhotoLog: vi.fn(),
	assertNutritionBarcodeDiary: vi.fn(),
	isNutritionFuelPageEnabled: vi.fn(async () => true),
	isNutritionBarcodeDiaryEnabled: vi.fn(async () => true),
	isNutritionPhotoLogEnabled: vi.fn(async () => true),
}));

vi.mock("~/lib/nutrition/consent.server", () => ({
	assertActiveNutritionConsent: vi.fn().mockResolvedValue({
		id: "consent-1",
		grantedAt: new Date("2026-08-01T00:00:00.000Z"),
		statement: { policyVersion: "nutrition-consent-v1" },
	}),
}));

vi.mock("~/lib/ai-consent.server", () => ({
	requireAIConsent: vi.fn(),
}));

vi.mock("~/lib/org-supply-settings.server", () => ({
	getOrganizationMetadata: vi.fn(async () => null),
}));

vi.mock("~/lib/rate-limiter.server", () => ({
	checkRateLimit: vi.fn(async () => ({ allowed: true })),
	rateLimitResponse: vi.fn(),
}));

vi.mock("~/lib/nutrition/food-barcode.server", () => ({
	lookupFoodBarcode: vi.fn(async () => ({ found: true, name: "Oats" })),
}));

vi.mock("~/lib/ledger.server", async () => {
	const actual = await vi.importActual<typeof import("~/lib/ledger.server")>(
		"~/lib/ledger.server",
	);
	return {
		...actual,
		checkBalance: vi.fn(async () => 10),
		deductCredits: vi.fn(async () => undefined),
	};
});

const occurredAt = "2026-11-10T12:00:00.000Z";
const now = new Date(occurredAt);

const owner: NutritionPrincipal = {
	userId: "user-1",
	organizationId: "org-1",
	surface: "web",
	authMethod: "session",
	scopes: ["nutrition:read", "nutrition:write"],
	requestId: "req",
};

function diaryInput(name: string) {
	const key = crypto.randomUUID();
	return {
		name,
		occurredAt,
		amount: 1,
		unit: "serving",
		macros: { energyKcal: 100, proteinG: 1, carbsG: 2, fatG: 3 },
		idempotencyKey: key,
		operationKey: key,
		compositionSource: "manual_macros" as const,
		now,
	};
}

async function database() {
	const { database: db, sqlite } = createSqliteD1();
	await db.exec(`
		CREATE TABLE organization (id text primary key, name text not null);
		CREATE TABLE user (
			id text primary key,
			tier text,
			tier_expires_at integer,
			settings text
		);
		CREATE TABLE nutrition_fuel_day (
			user_id text not null,
			fuel_date text not null,
			used integer not null default 0,
			primary key (user_id, fuel_date)
		);
		CREATE TABLE nutrition_intake (
			fuel_date text,
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
		CREATE TABLE nutrition_operation (
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
		CREATE TABLE nutrition_access_audit (
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
			occurred_at integer not null default (unixepoch())
		);
		CREATE TABLE queue_job (
			request_id text primary key,
			job_type text not null,
			organization_id text not null,
			user_id text,
			status text not null,
			result_json text,
			model_artifact text,
			processing_owner text,
			processing_lease_expires_at integer,
			created_at integer not null,
			expires_at integer not null
		);
		CREATE TABLE nutrition_food_draft (
			id text primary key,
			user_id text not null,
			organization_id text,
			organization_name_snapshot text,
			operation_id text not null,
			subject text not null,
			lines_json text,
			credits integer not null default 0,
			created_at integer not null
		);
		INSERT INTO organization VALUES ('org-1', 'Kitchen');
		INSERT INTO user VALUES (
			'user-1', 'free', NULL, '{"fuelTimeZone":"Europe/Dublin"}'
		);
		INSERT INTO user VALUES (
			'principal-9', 'free', NULL, '{"fuelTimeZone":"Europe/Dublin"}'
		);
	`);
	return { db, sqlite };
}

function envFor(db: D1Database, extras: Record<string, unknown> = {}): Env {
	return { DB: db, ...extras } as Env;
}

describe("fuel writers at the cap", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("does not increment used on update, and edit plus void still work at 3", async () => {
		const { db } = await database();
		const env = envFor(db);
		const first = await logDiaryFood(env, owner, {}, diaryInput("Breakfast"));
		await logDiaryFood(env, owner, {}, diaryInput("Lunch"));
		await logDiaryFood(env, owner, {}, diaryInput("Dinner"));
		expect(await readFuelUsed(db, "user-1", "2026-11-10")).toBe(3);
		await expect(
			logDiaryFood(env, owner, {}, diaryInput("Fourth")),
		).rejects.toBeInstanceOf(FuelDailyLimitError);
		expect(await readFuelUsed(db, "user-1", "2026-11-10")).toBe(3);

		const updated = await updateDiaryFood(
			env,
			owner,
			{},
			first.intakeId,
			diaryInput("Breakfast edited"),
		);
		expect(updated.intakeId).not.toBe(first.intakeId);
		expect(await readFuelUsed(db, "user-1", "2026-11-10")).toBe(3);

		await voidDiaryFood(env, owner, {}, updated.intakeId, {
			confirm: true,
			operationKey: crypto.randomUUID(),
			now,
		});
		expect(await readFuelUsed(db, "user-1", "2026-11-10")).toBe(2);
	});

	it("frees one slot when two voids overlap", async () => {
		const { db } = await database();
		const env = envFor(db);
		const first = await logDiaryFood(env, owner, {}, diaryInput("Breakfast"));
		await logDiaryFood(env, owner, {}, diaryInput("Lunch"));
		expect(await readFuelUsed(db, "user-1", "2026-11-10")).toBe(2);
		let arrived = 0;
		let release: () => void = () => {};
		const bothInside = new Promise<void>((resolve) => {
			release = resolve;
		});
		vi.mocked(isNutritionFuelPageEnabled).mockImplementation(async () => {
			arrived += 1;
			if (arrived >= 2) release();
			await bothInside;
			return true;
		});
		try {
			const settled = await Promise.race([
				Promise.allSettled([
					voidDiaryFood(env, owner, {}, first.intakeId, {
						confirm: true,
						operationKey: crypto.randomUUID(),
						now,
					}),
					voidDiaryFood(env, owner, {}, first.intakeId, {
						confirm: true,
						operationKey: crypto.randomUUID(),
						now,
					}),
				]),
				new Promise<never>((_, reject) => {
					setTimeout(
						() => reject(new Error("overlapping voids did not meet")),
						2000,
					);
				}),
			]);
			expect(settled.every((result) => result.status === "fulfilled")).toBe(
				true,
			);
			expect(await readFuelUsed(db, "user-1", "2026-11-10")).toBe(1);
		} finally {
			vi.mocked(isNutritionFuelPageEnabled).mockResolvedValue(true);
		}
	});

	it("refuses another user on update and void", async () => {
		const { db } = await database();
		const env = envFor(db);
		const first = await logDiaryFood(env, owner, {}, diaryInput("Breakfast"));
		const other = { ...owner, userId: "principal-9" };
		await expect(
			updateDiaryFood(env, other, {}, first.intakeId, diaryInput("Stolen")),
		).rejects.toBeInstanceOf(DiaryFoodNotFoundError);
		await expect(
			voidDiaryFood(env, other, {}, first.intakeId, {
				confirm: true,
				operationKey: crypto.randomUUID(),
				now,
			}),
		).rejects.toBeInstanceOf(DiaryFoodNotFoundError);
		expect(await readFuelUsed(db, "user-1", "2026-11-10")).toBe(1);
	});

	it("rejects a barcode lookup before the lookup when the day is full", async () => {
		const { db } = await database();
		await db
			.prepare(
				"INSERT INTO nutrition_fuel_day (user_id, fuel_date, used) VALUES (?, ?, 3)",
			)
			.bind("user-1", fuelDateForInstant(new Date(), "Europe/Dublin"))
			.run();
		const request = new Request("https://ration.test/barcode", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ barcode: "012345678905" }),
		});
		await expect(
			postFoodBarcode(request, envFor(db), owner, {}),
		).rejects.toBeInstanceOf(FuelDailyLimitError);
		expect(lookupFoodBarcode).not.toHaveBeenCalled();
	});

	it("uses the MCP credential principal and not another id", async () => {
		const { db } = await database();
		await db
			.prepare(
				"INSERT INTO nutrition_fuel_day (user_id, fuel_date, used) VALUES (?, ?, 3)",
			)
			.bind("principal-9", fuelDateForInstant(new Date(), "Europe/Dublin"))
			.run();
		const [lookup] = createFoodLogToolDefs(envFor(db) as never);
		const ctx = {
			userId: "principal-9",
			organizationId: "org-1",
			scopes: ["mcp:nutrition:read"],
			authMethod: "oauth",
			apiKeyId: "key",
			keyName: "key",
			keyPrefix: "key",
			preClaim: false,
			agentSurface: "mcp",
		} as McpToolContext;
		await expect(
			lookup?.handler(ctx, {
				barcode: "012345678905",
				userId: "user-1",
			} as never),
		).rejects.toBeInstanceOf(FuelDailyLimitError);
		expect(lookupFoodBarcode).not.toHaveBeenCalled();
	});
});

describe("fuel photo queue", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("does not store the photo when the free day is full", async () => {
		const { db } = await database();
		await db
			.prepare(
				"INSERT INTO nutrition_fuel_day (user_id, fuel_date, used) VALUES (?, ?, 3)",
			)
			.bind("user-1", "2026-11-10")
			.run();
		const put = vi.fn();
		await expect(
			submitFuelPhoto(
				envFor(db, { STORAGE: { put, delete: vi.fn() } }),
				owner,
				{},
				{
					operationKey: crypto.randomUUID(),
					contentType: "image/jpeg",
					bytes: new Uint8Array([1, 2, 3]).buffer,
					now,
				},
			),
		).rejects.toBeInstanceOf(FuelDailyLimitError);
		expect(put).not.toHaveBeenCalled();
	});

	it("does not upload when no fuel zone can be resolved", async () => {
		const { db } = await database();
		await db
			.prepare("UPDATE user SET settings = '{}' WHERE id = ?")
			.bind("user-1")
			.run();
		const put = vi.fn();
		await expect(
			submitFuelPhoto(
				envFor(db, { STORAGE: { put, delete: vi.fn() } }),
				owner,
				{},
				{
					operationKey: crypto.randomUUID(),
					contentType: "image/jpeg",
					bytes: new Uint8Array([1, 2, 3]).buffer,
					now,
				},
			),
		).rejects.toBeInstanceOf(FuelTimezoneRequiredError);
		expect(put).not.toHaveBeenCalled();
	});

	it("refunds once and deletes R2 when enqueue fails", async () => {
		const { db } = await database();
		const put = vi.fn(async () => undefined);
		const remove = vi.fn(async () => undefined);
		const refund = vi.fn(async (_env, input) => {
			await input.writeStatus();
		});
		await expect(
			submitFuelPhoto(
				envFor(db, {
					STORAGE: { put, delete: remove },
					FUEL_PHOTO_QUEUE: {
						send: vi.fn(async () => {
							throw new Error("enqueue_failed");
						}),
					},
				}),
				owner,
				{},
				{
					operationKey: crypto.randomUUID(),
					contentType: "image/jpeg",
					bytes: new Uint8Array([1, 2, 3]).buffer,
					now,
				},
				{ refund, now },
			),
		).rejects.toThrow("enqueue_failed");
		expect(refund).toHaveBeenCalledTimes(1);
		expect(remove).toHaveBeenCalledTimes(1);
	});

	it("confirms two detected foods as one intake", async () => {
		const { db, sqlite } = await database();
		const requestId = crypto.randomUUID();
		const operationId = crypto.randomUUID();
		const draftId = crypto.randomUUID();
		const expires = Math.floor(now.getTime() / 1000) + 3600;
		const meta = {
			cost: 2,
			imageKey: `fuel-photo/user-1/${requestId}`,
			mimeType: "image/jpeg",
			operationId,
			draftId,
			readyAt: occurredAt,
		};
		sqlite.exec(`
			INSERT INTO queue_job VALUES (
				'${requestId}', 'fuel_photo', 'org-1', 'user-1', 'completed',
				'${JSON.stringify(meta).replaceAll("'", "''")}', NULL, NULL, NULL, ${expires}, ${expires}
			);
			INSERT INTO nutrition_food_draft VALUES (
				'${draftId}', 'user-1', 'org-1', 'Kitchen', '${operationId}', 'custom',
				'${JSON.stringify([
					{ name: "Rice", energyKcal: 100, proteinG: 2, carbsG: 20, fatG: 1 },
					{ name: "Beans", energyKcal: 80, proteinG: 5, carbsG: 10, fatG: 1 },
				]).replaceAll("'", "''")}',
				2, ${expires}
			);
		`);
		const saved = await confirmFuelPhoto(
			envFor(db),
			owner,
			{},
			requestId,
			diaryInput("Rice, Beans"),
		);
		expect(saved.intakeId).toBeTruthy();
		const active = await db
			.prepare(
				"SELECT COUNT(*) AS n FROM nutrition_intake WHERE voided_at IS NULL",
			)
			.first<{ n: number }>();
		expect(active?.n).toBe(1);
		expect(await readFuelUsed(db, "user-1", "2026-11-10")).toBe(1);
	});

	it("does not call the model twice or refund a ready draft", async () => {
		const { db } = await database();
		const requestId = crypto.randomUUID();
		const operationId = crypto.randomUUID();
		const expires = new Date(now.getTime() + 3600_000);
		const meta = {
			cost: 2,
			imageKey: "fuel-photo/user-1/photo",
			mimeType: "image/jpeg" as const,
			operationId,
		};
		const { drizzle } = await import("drizzle-orm/d1");
		const schema = await import("~/db/schema");
		const orm = drizzle(db, { schema });
		await orm.insert(schema.nutritionOperation).values({
			id: operationId,
			userId: "user-1",
			organizationId: "org-1",
			operationKey: crypto.randomUUID(),
			requestHash: requestId,
			operationType: "fuel_photo",
			status: "in_progress",
			itemCount: 1,
			resultJson: { requestId },
			createdAt: now,
		});
		await orm.insert(schema.queueJob).values({
			requestId,
			jobType: "fuel_photo",
			organizationId: "org-1",
			userId: "user-1",
			status: "pending",
			resultJson: JSON.stringify(meta),
			expiresAt: expires,
		});
		const analyze = vi.fn(async () => [
			{
				name: "Rice",
				energyKcal: 1,
				proteinG: 1,
				carbsG: 1,
				fatG: 1,
				fiberG: null,
				amount: 1,
				unit: "serving",
				barcode: null,
				fdcId: null,
				compositionSource: "ai_estimate" as const,
			},
			{
				name: "Beans",
				energyKcal: 1,
				proteinG: 1,
				carbsG: 1,
				fatG: 1,
				fiberG: null,
				amount: 1,
				unit: "serving",
				barcode: null,
				fdcId: null,
				compositionSource: "ai_estimate" as const,
			},
		]);
		const refund = vi.fn();
		const storage = {
			get: vi.fn(async () => ({
				arrayBuffer: async () => new Uint8Array([1]).buffer,
			})),
			delete: vi.fn(async () => undefined),
			put: vi.fn(),
		};
		const env = envFor(db, { STORAGE: storage });
		await runFuelPhotoConsumerJob(env, { requestId }, { analyze, refund, now });
		expect(analyze).toHaveBeenCalledTimes(1);
		expect(refund).not.toHaveBeenCalled();
		await db
			.prepare("UPDATE queue_job SET status = 'pending' WHERE request_id = ?")
			.bind(requestId)
			.run();
		await runFuelPhotoConsumerJob(env, { requestId }, { analyze, refund, now });
		expect(analyze).toHaveBeenCalledTimes(1);
		expect(refund).not.toHaveBeenCalled();
	});

	it("refunds a failed analysis once", async () => {
		const { db } = await database();
		const requestId = crypto.randomUUID();
		const operationId = crypto.randomUUID();
		const expires = new Date(now.getTime() + 3600_000);
		const { drizzle } = await import("drizzle-orm/d1");
		const schema = await import("~/db/schema");
		const orm = drizzle(db, { schema });
		await orm.insert(schema.nutritionOperation).values({
			id: operationId,
			userId: "user-1",
			organizationId: "org-1",
			operationKey: crypto.randomUUID(),
			requestHash: requestId,
			operationType: "fuel_photo",
			status: "in_progress",
			itemCount: 1,
			resultJson: { requestId },
			createdAt: now,
		});
		await orm.insert(schema.queueJob).values({
			requestId,
			jobType: "fuel_photo",
			organizationId: "org-1",
			userId: "user-1",
			status: "pending",
			resultJson: JSON.stringify({
				cost: 2,
				imageKey: "fuel-photo/user-1/bad",
				mimeType: "image/jpeg",
				operationId,
			}),
			expiresAt: expires,
		});
		const analyze = vi.fn(async () => {
			throw new Error("model_down");
		});
		const refund = vi.fn(async (_env, input) => {
			await input.writeStatus();
		});
		const env = envFor(db, {
			STORAGE: {
				get: async () => ({ arrayBuffer: async () => new ArrayBuffer(1) }),
				delete: async () => undefined,
			},
		});
		await expect(
			runFuelPhotoConsumerJob(env, { requestId }, { analyze, refund, now }),
		).rejects.toThrow("model_down");
		await runFuelPhotoConsumerJob(env, { requestId }, { analyze, refund, now });
		expect(analyze).toHaveBeenCalledTimes(1);
		expect(refund).toHaveBeenCalledTimes(1);
		await expect(readFuelPhoto(env, "user-1", requestId, now)).resolves.toEqual(
			expect.objectContaining({ status: "failed", lines: null }),
		);
	});

	it("refuses an oversized photo before storing it", async () => {
		const { db } = await database();
		const put = vi.fn();
		const bytes = new Uint8Array(FUEL_PHOTO_MAX_BYTES + 1);
		await expect(
			submitFuelPhoto(
				envFor(db, { STORAGE: { put, delete: vi.fn() } }),
				owner,
				{},
				{
					operationKey: crypto.randomUUID(),
					contentType: "image/jpeg",
					bytes: bytes.buffer,
					now,
				},
			),
		).rejects.toBeInstanceOf(FuelPhotoTooLargeError);
		expect(put).not.toHaveBeenCalled();
	});

	it("refuses the photo when photo log is off", async () => {
		const { db } = await database();
		vi.mocked(assertNutritionPhotoLog).mockRejectedValueOnce(
			Object.assign(new Error("Photo food log is unavailable."), {
				code: "FEATURE_DISABLED",
				status: 403,
			}),
		);
		const put = vi.fn();
		await expect(
			submitFuelPhoto(
				envFor(db, { STORAGE: { put, delete: vi.fn() } }),
				owner,
				{},
				{
					operationKey: crypto.randomUUID(),
					contentType: "image/jpeg",
					bytes: new Uint8Array([1, 2, 3]).buffer,
					now,
				},
			),
		).rejects.toMatchObject({ code: "FEATURE_DISABLED" });
		expect(put).not.toHaveBeenCalled();
	});

	it("refuses the photo when the balance is short of 2 credits", async () => {
		const { db } = await database();
		const { checkBalance } = await import("~/lib/ledger.server");
		vi.mocked(checkBalance).mockResolvedValueOnce(1);
		const put = vi.fn();
		await expect(
			submitFuelPhoto(
				envFor(db, { STORAGE: { put, delete: vi.fn() } }),
				owner,
				{},
				{
					operationKey: crypto.randomUUID(),
					contentType: "image/jpeg",
					bytes: new Uint8Array([1, 2, 3]).buffer,
					now,
				},
			),
		).rejects.toBeInstanceOf(InsufficientCreditsError);
		expect(put).not.toHaveBeenCalled();
	});

	it("returns insufficient credits when the balance is short of 2", async () => {
		const { db } = await database();
		const { checkBalance } = await import("~/lib/ledger.server");
		vi.mocked(checkBalance).mockResolvedValueOnce(0);
		const request = new Request("https://ration.test/api/nutrition/diary/photo", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				operationKey: crypto.randomUUID(),
				contentType: "image/jpeg",
				imageBase64: btoa("abc"),
			}),
		});
		await expect(postFuelPhoto(request, envFor(db), owner, {})).rejects.toMatchObject(
			{
				data: { code: "insufficient_credits" },
				init: { status: 402 },
			},
		);
	});

	it("rejects an envelope over twice the photo limit before decoding", async () => {
		const { db } = await database();
		const request = new Request("https://ration.test/api/nutrition/diary/photo", {
			method: "POST",
			headers: {
				"content-length": String(FUEL_PHOTO_MAX_BYTES * 2 + 1),
				"content-type": "application/json",
			},
			body: "{}",
		});
		await expect(
			postFuelPhoto(request, envFor(db), owner, {}),
		).rejects.toMatchObject({
			data: { code: "photo_too_large" },
		});
	});

	it("keeps one draft line for a plate, ingredients, one item, or a drink", () => {
		expect(FUEL_PHOTO_PROMPT).toContain("prepared plate");
		expect(FUEL_PHOTO_PROMPT).toContain("set of ingredients");
		expect(FUEL_PHOTO_PROMPT).toContain("one ingredient");
		expect(FUEL_PHOTO_PROMPT).toContain("drink");
		expect(FUEL_PHOTO_PROMPT).toContain("visible size");
		expect(FUEL_PHOTO_PROMPT).toContain("not medical advice");
		expect(
			collapseFuelPhotoLines([
				{
					name: "Stew",
					amount: 1.5,
					unit: "bowl",
					energyKcal: 400,
					proteinG: 20,
					carbsG: 30,
					fatG: 12,
				},
			]),
		).toEqual(
			expect.objectContaining({
				name: "Stew",
				amount: 1.5,
				unit: "bowl",
				energyKcal: 400,
				compositionSource: "ai_estimate",
			}),
		);
	});

	it("approves the edited estimate on the stored fuel date without another debit", async () => {
		const { db, sqlite } = await database();
		sqlite.exec(`
			CREATE TABLE cargo (
				id text primary key,
				organization_id text,
				quantity real
			);
			INSERT INTO cargo VALUES ('cargo-1', 'org-1', 4);
		`);
		const requestId = crypto.randomUUID();
		const operationId = crypto.randomUUID();
		const draftId = crypto.randomUUID();
		const key = crypto.randomUUID();
		const expires = Math.floor(now.getTime() / 1000) + 3600;
		const meta = {
			cost: 2,
			imageKey: `fuel-photo/user-1/${requestId}`,
			mimeType: "image/jpeg",
			operationId,
			draftId,
			readyAt: occurredAt,
		};
		const { drizzle } = await import("drizzle-orm/d1");
		const schema = await import("~/db/schema");
		const orm = drizzle(db, { schema });
		await orm.insert(schema.nutritionOperation).values({
			id: operationId,
			userId: "user-1",
			organizationId: "org-1",
			operationKey: crypto.randomUUID(),
			requestHash: requestId,
			operationType: "fuel_photo",
			status: "completed",
			itemCount: 1,
			resultJson: { requestId, fuelDate: "2026-11-10" },
			createdAt: now,
		});
		sqlite.exec(`
			INSERT INTO queue_job VALUES (
				'${requestId}', 'fuel_photo', 'org-1', 'user-1', 'completed',
				'${JSON.stringify(meta).replaceAll("'", "''")}', NULL, NULL, NULL, ${expires}, ${expires}
			);
			INSERT INTO nutrition_food_draft VALUES (
				'${draftId}', 'user-1', 'org-1', 'Kitchen', '${operationId}', 'custom',
				'${JSON.stringify([{ name: "Soup", energyKcal: 120, proteinG: 4, carbsG: 10, fatG: 6, amount: 250, unit: "g" }]).replaceAll("'", "''")}',
				2, ${expires}
			);
		`);
		const { deductCredits } = await import("~/lib/ledger.server");
		const saved = await confirmFuelPhoto(
			envFor(db),
			owner,
			{},
			requestId,
			{
				name: "Soup",
				occurredAt,
				amount: 250,
				unit: "g",
				macros: { energyKcal: 120, proteinG: 4, carbsG: 10, fatG: 6 },
				idempotencyKey: key,
				operationKey: key,
				compositionSource: "ai_estimate",
				fuelTimeZone: "Europe/Dublin",
				now,
			},
		);
		const row = await db
			.prepare(
				`SELECT meal_name_snapshot AS name, logged_amount AS amount, logged_unit AS unit,
				 composition_source AS compositionSource, fuel_date AS fuelDate,
				 energy_kcal AS energyKcal, protein_g AS proteinG, carbs_g AS carbsG, fat_g AS fatG
				 FROM nutrition_intake WHERE id = ?`,
			)
			.bind(saved.intakeId)
			.first<{
				name: string;
				amount: number;
				unit: string;
				compositionSource: string;
				fuelDate: string;
				energyKcal: number;
				proteinG: number;
				carbsG: number;
				fatG: number;
			}>();
		expect(row).toEqual({
			name: "Soup",
			amount: 250,
			unit: "g",
			compositionSource: "ai_estimate",
			fuelDate: "2026-11-10",
			energyKcal: 120,
			proteinG: 4,
			carbsG: 10,
			fatG: 6,
		});
		const cargo = await db
			.prepare("SELECT quantity FROM cargo WHERE id = 'cargo-1'")
			.first<{ quantity: number }>();
		expect(cargo?.quantity).toBe(4);
		expect(deductCredits).not.toHaveBeenCalled();
	});
});
