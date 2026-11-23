import { describe, expect, it, vi } from "vitest";
import { InsufficientCreditsError } from "~/lib/ledger.server";
import { submitDurableRecipeImport } from "~/lib/import-dispatch.server";
import { RecipeImportRequestSchema } from "~/lib/schemas/recipe-import";
import { createMockR2 } from "~/test/helpers/mock-env";
import { createSqliteD1 } from "~/test/helpers/sqlite-d1";
import {
	resolveImportOrganization,
	shareImportKitchenPickerClientAllowed,
} from "~/lib/share-import-kitchen.server";

const requestId = "33333333-3333-4333-8333-333333333333";

function kitchenDb() {
	const { database, sqlite } = createSqliteD1();
	sqlite.exec(`
CREATE TABLE organization (
  id TEXT PRIMARY KEY,
  name TEXT,
  credits INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE member (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at INTEGER NOT NULL
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
`);
	sqlite
		.prepare(
			`INSERT INTO organization (id, name, credits) VALUES
			 ('personal', 'Personal Group', 0),
			 ('crew', 'Crew Kitchen', 9)`,
		)
		.run();
	sqlite
		.prepare(
			`INSERT INTO member (id, organization_id, user_id, role, created_at) VALUES
			 ('m1', 'personal', 'user-1', 'owner', 1),
			 ('m2', 'crew', 'user-1', 'owner', 1)`,
		)
		.run();
	return { database, sqlite };
}

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

const input = {
	userId: "user-1",
	clientRequestId: requestId,
	url: "https://example.com/recipe",
	sourceKind: "web" as const,
	hasPhoto: false,
};

describe("share import kitchen", () => {
	it("fails the picker closed below iOS 1.6.48 and off iOS", () => {
		expect(
			shareImportKitchenPickerClientAllowed({
				clientPlatform: "ios",
				clientVersion: "1.6.48",
			}),
		).toBe(false);
		expect(
			shareImportKitchenPickerClientAllowed({
				clientPlatform: "ios",
				clientVersion: "1.6.49",
			}),
		).toBe(true);
		expect(
			shareImportKitchenPickerClientAllowed({
				clientPlatform: "web",
				clientVersion: "1.11.34",
			}),
		).toBe(false);
		expect(shareImportKitchenPickerClientAllowed({ clientPlatform: "ios" })).toBe(
			false,
		);
	});

	it("accepts a kitchen id only after membership is verified", async () => {
		const { database } = kitchenDb();
		const env = envFor(database).env;
		await expect(
			resolveImportOrganization(env, "user-1", "personal", "crew"),
		).resolves.toBe("crew");
		await expect(
			resolveImportOrganization(env, "user-1", "personal", undefined),
		).resolves.toBe("personal");
		await expect(
			resolveImportOrganization(env, "user-1", "personal", "stranger"),
		).rejects.toMatchObject({ init: { status: 403 } });
	});

	it("retargets an uncharged reservation and charges the confirmed kitchen once", async () => {
		const { database, sqlite } = kitchenDb();
		await expect(
			submitDurableRecipeImport(envFor(database).env, {
				...input,
				organizationId: "personal",
			}),
		).rejects.toBeInstanceOf(InsufficientCreditsError);
		const parked = sqlite
			.prepare("SELECT state, organization_id FROM import_dispatch")
			.get() as { state: string; organization_id: string };
		expect(parked).toEqual({ state: "reserved", organization_id: "personal" });

		const moved = await submitDurableRecipeImport(envFor(database).env, {
			...input,
			organizationId: "crew",
		});
		expect(moved).toEqual({ status: "processing", requestId });
		const credits = sqlite
			.prepare("SELECT id, credits FROM organization ORDER BY id")
			.all() as { id: string; credits: number }[];
		expect(credits).toEqual([
			{ id: "crew", credits: 6 },
			{ id: "personal", credits: 0 },
		]);
		const row = sqlite
			.prepare("SELECT organization_id, state FROM import_dispatch")
			.get() as { organization_id: string; state: string };
		expect(row.organization_id).toBe("crew");
		expect(row.state === "debited" || row.state === "dispatched").toBe(true);
		expect(
			(
				sqlite.prepare("SELECT count(*) AS n FROM ledger").get() as { n: number }
			).n,
		).toBe(1);

		const replay = await submitDurableRecipeImport(envFor(database).env, {
			...input,
			organizationId: "crew",
		});
		expect(replay.requestId).toBe(requestId);
		expect(
			(
				sqlite
					.prepare("SELECT credits FROM organization WHERE id = 'crew'")
					.get() as { credits: number }
			).credits,
		).toBe(6);
	});

	it("refuses to move a kitchen that was already charged", async () => {
		const { database, sqlite } = kitchenDb();
		sqlite
			.prepare("UPDATE organization SET credits = 9 WHERE id = 'personal'")
			.run();
		await submitDurableRecipeImport(envFor(database).env, {
			...input,
			organizationId: "personal",
		});
		await expect(
			submitDurableRecipeImport(envFor(database).env, {
				...input,
				organizationId: "crew",
			}),
		).rejects.toMatchObject({
			data: { code: "import_kitchen_locked" },
			init: { status: 409 },
		});
		const credits = sqlite
			.prepare("SELECT id, credits FROM organization ORDER BY id")
			.all() as { id: string; credits: number }[];
		expect(credits).toEqual([
			{ id: "crew", credits: 9 },
			{ id: "personal", credits: 6 },
		]);
	});

	it("keeps organizationId optional on the import body", () => {
		expect(
			RecipeImportRequestSchema.safeParse({
				url: "https://example.com/recipe",
				organizationId: "33333333-3333-4333-8333-333333333333",
			}).success,
		).toBe(true);
		expect(
			RecipeImportRequestSchema.safeParse({
				url: "https://example.com/recipe",
				organizationId: "not-a-uuid",
			}).success,
		).toBe(false);
	});
});
