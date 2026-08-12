import { and, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { beforeEach, describe, expect, it } from "vitest";
import * as schema from "~/db/schema";
import {
	consumeMobileAuthCode,
	rotateMobileRefreshToken,
	storeMobileAuthCode,
} from "~/lib/mobile/token.server";
import { hashOAuthStoredToken } from "~/lib/oauth-token-hash.server";
import { createMockEnv } from "~/test/helpers/mock-env";
import { createSqliteD1 } from "~/test/helpers/sqlite-d1";

const DDL = `
CREATE TABLE user (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL
);
CREATE TABLE organization (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);
CREATE TABLE member (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL
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
	});
});
