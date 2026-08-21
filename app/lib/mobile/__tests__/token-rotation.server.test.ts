import { and, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { beforeEach, describe, expect, it } from "vitest";
import * as schema from "~/db/schema";
import {
	assertMobileOrgMembership,
	consumeMobileAuthCode,
	rotateMobileRefreshToken,
	storeMobileAuthCode,
} from "~/lib/mobile/token.server";
import { hashOAuthStoredToken } from "~/lib/oauth-token-hash.server";
import { createMockEnv } from "~/test/helpers/mock-env";
import { createSqliteD1 } from "~/test/helpers/sqlite-d1";

function createMemoryKV(): KVNamespace {
	const store = new Map<string, string>();
	return {
		get: async (key: string) => store.get(key) ?? null,
		put: async (key: string, value: string) => {
			store.set(key, value);
		},
		delete: async (key: string) => {
			store.delete(key);
		},
	} as unknown as KVNamespace;
}

const DDL = `
CREATE TABLE user (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL
);
CREATE TABLE organization (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT,
  metadata TEXT
);
CREATE TABLE member (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE mobile_auth_code (
  code TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE mobile_refresh_token (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  family_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
`;

describe("mobile auth code + refresh rotation (D1)", () => {
	const { database, sqlite } = createSqliteD1();
	const env = createMockEnv();
	env.DB = database;
	env.BETTER_AUTH_SECRET = "test-mobile-auth-secret-32chars!!";

	beforeEach(() => {
		env.RATION_KV = createMemoryKV();
		sqlite.exec("PRAGMA foreign_keys = OFF");
		sqlite.exec(`
DROP TABLE IF EXISTS mobile_refresh_token;
DROP TABLE IF EXISTS mobile_auth_code;
DROP TABLE IF EXISTS member;
DROP TABLE IF EXISTS organization;
DROP TABLE IF EXISTS user;
`);
		sqlite.exec(DDL);
		sqlite
			.prepare("INSERT INTO user (id, name, email) VALUES (?, ?, ?)")
			.run("user-1", "Test", "t@example.com");
		sqlite
			.prepare("INSERT INTO organization (id, name) VALUES (?, ?)")
			.run("org-1", "Kitchen");
		sqlite
			.prepare(
				"INSERT INTO member (id, organization_id, user_id, role) VALUES (?, ?, ?, ?)",
			)
			.run("m-1", "org-1", "user-1", "owner");
	});

	it("consumes an auth code only once under parallel redeem", async () => {
		const code = await storeMobileAuthCode(
			env,
			"user-1",
			"org-1",
			"challenge-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		);

		const [first, second] = await Promise.all([
			consumeMobileAuthCode(env, code),
			consumeMobileAuthCode(env, code),
		]);

		const winners = [first, second].filter(Boolean);
		expect(winners).toHaveLength(1);
		expect(winners[0]).toMatchObject({
			userId: "user-1",
			organizationId: "org-1",
		});
	});

	it("rejects a second sequential redeem of the same code", async () => {
		const code = await storeMobileAuthCode(
			env,
			"user-1",
			"org-1",
			"challenge-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		);
		expect(await consumeMobileAuthCode(env, code)).not.toBeNull();
		expect(await consumeMobileAuthCode(env, code)).toBeNull();
	});

	it("atomically rotates refresh tokens so only one concurrent winner mints", async () => {
		const refreshToken = "refresh-token-aaaaaaaaaaaaaaaaaaaaaaaa";
		const tokenHash = await hashOAuthStoredToken(refreshToken);
		const familyId = "family-1";
		const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 24;
		sqlite
			.prepare(
				`INSERT INTO mobile_refresh_token
				(id, user_id, organization_id, token_hash, family_id, expires_at)
				VALUES (?, ?, ?, ?, ?, ?)`,
			)
			.run("rt-1", "user-1", "org-1", tokenHash, familyId, expiresAt);

		const [a, b] = await Promise.allSettled([
			rotateMobileRefreshToken(env, refreshToken),
			rotateMobileRefreshToken(env, refreshToken),
		]);

		const fulfilled = [a, b].filter((r) => r.status === "fulfilled");
		const rejected = [a, b].filter((r) => r.status === "rejected");

		// One wins; the other may succeed via grace cache or reject.
		expect(fulfilled.length).toBeGreaterThanOrEqual(1);
		expect(fulfilled.length + rejected.length).toBe(2);

		const db = drizzle(env.DB, { schema });
		const active = await db.query.mobileRefreshToken.findMany({
			where: and(
				eq(schema.mobileRefreshToken.familyId, familyId),
				isNull(schema.mobileRefreshToken.revokedAt),
			),
		});
		expect(active.length).toBe(1);

		if (fulfilled.length === 2) {
			const tokens = fulfilled.map(
				(r) =>
					(r as PromiseFulfilledResult<{ refreshToken: string }>).value
						.refreshToken,
			);
			expect(tokens[0]).toBe(tokens[1]);
		}

		if (rejected.length > 0) {
			const reasons = rejected.map(
				(r) => (r as PromiseRejectedResult).reason as Error,
			);
			expect(reasons.every((err) => err.message === "server_busy")).toBe(true);
			expect(
				reasons.some((err) => err.message === "invalid_refresh_token"),
			).toBe(false);
		}
	});

	it("repairs a missing personal-org member on refresh instead of forbidden_org", async () => {
		sqlite.exec("DELETE FROM member");
		sqlite
			.prepare("UPDATE organization SET slug = ?, metadata = ? WHERE id = ?")
			.run("personal-user-1", JSON.stringify({ isPersonal: true }), "org-1");

		const refreshToken = "refresh-token-repair-aaaaaaaaaaaaaaaaaaaa";
		const tokenHash = await hashOAuthStoredToken(refreshToken);
		const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 24;
		sqlite
			.prepare(
				`INSERT INTO mobile_refresh_token
				(id, user_id, organization_id, token_hash, family_id, expires_at)
				VALUES (?, ?, ?, ?, ?, ?)`,
			)
			.run(
				"rt-repair",
				"user-1",
				"org-1",
				tokenHash,
				"family-repair",
				expiresAt,
			);

		await expect(rotateMobileRefreshToken(env, refreshToken)).resolves.toEqual(
			expect.objectContaining({
				accessToken: expect.any(String),
				refreshToken: expect.any(String),
			}),
		);

		const membership = sqlite
			.prepare(
				"SELECT id FROM member WHERE user_id = ? AND organization_id = ?",
			)
			.get("user-1", "org-1");
		expect(membership).toBeTruthy();
	});

	it("does not repair membership for a kitchen the user does not belong to", async () => {
		sqlite.exec("DELETE FROM member");

		await expect(
			assertMobileOrgMembership(env, "user-1", "org-1"),
		).rejects.toThrow("forbidden_org");
	});

	it("does not insert membership on another user's personal org", async () => {
		sqlite.exec("DELETE FROM member");
		sqlite
			.prepare("UPDATE organization SET slug = ?, metadata = ? WHERE id = ?")
			.run(
				"personal-other-user",
				JSON.stringify({ isPersonal: true }),
				"org-1",
			);

		await expect(
			assertMobileOrgMembership(env, "user-1", "org-1"),
		).rejects.toThrow("forbidden_org");

		const membership = sqlite
			.prepare(
				"SELECT id FROM member WHERE user_id = ? AND organization_id = ?",
			)
			.get("user-1", "org-1");
		expect(membership).toBeUndefined();
	});

	it("returns server_busy without family-wipe when the claim loses and grace is missing", async () => {
		const refreshToken = "refresh-token-nograce-aaaaaaaaaaaaaaaaaa";
		const tokenHash = await hashOAuthStoredToken(refreshToken);
		const familyId = "family-nograce";
		const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 24;
		sqlite
			.prepare(
				`INSERT INTO mobile_refresh_token
				(id, user_id, organization_id, token_hash, family_id, expires_at)
				VALUES (?, ?, ?, ?, ?, ?)`,
			)
			.run("rt-nograce", "user-1", "org-1", tokenHash, familyId, expiresAt);

		env.RATION_KV.get = (async () => null) as unknown as KVNamespace["get"];

		const originalPrepare = env.DB.prepare.bind(env.DB);
		env.DB.prepare = ((query: string) => {
			const stmt = originalPrepare(query);
			if (
				query.includes("UPDATE mobile_refresh_token SET revoked_at") &&
				query.includes("revoked_at IS NULL")
			) {
				return {
					bind: () => ({
						run: async () => ({
							success: true,
							results: [],
							meta: { changes: 0 },
						}),
					}),
				} as unknown as ReturnType<D1Database["prepare"]>;
			}
			return stmt;
		}) as D1Database["prepare"];

		try {
			await expect(rotateMobileRefreshToken(env, refreshToken)).rejects.toThrow(
				"server_busy",
			);
		} finally {
			env.DB.prepare = originalPrepare;
		}

		const db = drizzle(env.DB, { schema });
		const active = await db.query.mobileRefreshToken.findMany({
			where: and(
				eq(schema.mobileRefreshToken.familyId, familyId),
				isNull(schema.mobileRefreshToken.revokedAt),
			),
		});
		expect(active).toHaveLength(1);
		expect(active[0]?.id).toBe("rt-nograce");
	});

	it("family-wipes stolen refresh reuse after the grace window", async () => {
		const refreshToken = "refresh-token-stolen-aaaaaaaaaaaaaaaaaaa";
		const tokenHash = await hashOAuthStoredToken(refreshToken);
		const familyId = "family-stolen";
		const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 24;
		const revokedAt = Math.floor(Date.now() / 1000) - 60;
		sqlite
			.prepare(
				`INSERT INTO mobile_refresh_token
				(id, user_id, organization_id, token_hash, family_id, expires_at, revoked_at)
				VALUES (?, ?, ?, ?, ?, ?, ?)`,
			)
			.run(
				"rt-stolen",
				"user-1",
				"org-1",
				tokenHash,
				familyId,
				expiresAt,
				revokedAt,
			);
		sqlite
			.prepare(
				`INSERT INTO mobile_refresh_token
				(id, user_id, organization_id, token_hash, family_id, expires_at)
				VALUES (?, ?, ?, ?, ?, ?)`,
			)
			.run(
				"rt-stolen-new",
				"user-1",
				"org-1",
				`${tokenHash}-new`,
				familyId,
				expiresAt,
			);

		await expect(rotateMobileRefreshToken(env, refreshToken)).rejects.toThrow(
			"invalid_refresh_token",
		);

		const db = drizzle(env.DB, { schema });
		const active = await db.query.mobileRefreshToken.findMany({
			where: and(
				eq(schema.mobileRefreshToken.familyId, familyId),
				isNull(schema.mobileRefreshToken.revokedAt),
			),
		});
		expect(active).toHaveLength(0);
	});
});
