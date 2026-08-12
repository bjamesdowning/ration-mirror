import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockEnv } from "~/test/helpers/mock-env";
import { createSqliteD1 } from "~/test/helpers/sqlite-d1";

vi.mock("~/lib/apple-token-revoke.server", () => ({
	revokeAppleTokensForUser: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("~/lib/stripe.server", () => ({
	cancelStripeSubscriptionsForCustomer: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("~/lib/copilot/purge.server", () => ({
	purgeCopilotConversationsForUser: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("~/lib/kitchen-event-purge.server", () => ({
	redactAllNutritionPayloadsForUser: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("~/lib/nutrition/consent.server", () => ({
	eraseNutritionData: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("~/lib/r2-cleanup.server", () => ({
	deleteR2Prefix: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("~/lib/organizations.server", () => ({
	deleteOrganization: vi.fn().mockResolvedValue(undefined),
}));

/**
 * Minimal tables for purgeUserAccount's D1 wipe path (orgs step + batch + user).
 * Column names match Drizzle schema so generated SQL succeeds.
 */
const DDL = `
CREATE TABLE user (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  email_verified INTEGER,
  image TEXT,
  created_at INTEGER,
  updated_at INTEGER,
  stripe_customer_id TEXT,
  tier TEXT,
  tier_expires_at INTEGER,
  settings TEXT,
  role TEXT,
  banned INTEGER,
  ban_reason TEXT,
  ban_expires INTEGER,
  last_active_at INTEGER,
  deleted_at INTEGER
);
CREATE TABLE organization (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT,
  logo TEXT,
  metadata TEXT,
  created_at INTEGER,
  credits INTEGER
);
CREATE TABLE member (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at INTEGER
);
CREATE TABLE invitation (
  id TEXT PRIMARY KEY,
  organization_id TEXT,
  email TEXT,
  role TEXT,
  status TEXT,
  expires_at INTEGER,
  inviter_id TEXT,
  created_at INTEGER
);
CREATE TABLE agent_registration (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  organization_id TEXT,
  api_key_id TEXT,
  label TEXT,
  status TEXT,
  claim_code_hash TEXT,
  claim_expires_at INTEGER,
  created_at INTEGER,
  updated_at INTEGER,
  last_seen_at INTEGER,
  metadata TEXT
);
CREATE TABLE ledger (
  id TEXT PRIMARY KEY,
  organization_id TEXT,
  user_id TEXT,
  amount INTEGER,
  reason TEXT,
  created_at INTEGER
);
CREATE TABLE kitchen_event (
  id TEXT PRIMARY KEY,
  organization_id TEXT,
  user_id TEXT,
  type TEXT,
  payload TEXT,
  created_at INTEGER,
  meal_id TEXT,
  cargo_id TEXT,
  request_id TEXT
);
CREATE TABLE api_key (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  organization_id TEXT,
  name TEXT,
  key_hash TEXT,
  prefix TEXT,
  created_at INTEGER,
  last_used_at INTEGER,
  revoked_at INTEGER
);
CREATE TABLE verification (
  id TEXT PRIMARY KEY,
  identifier TEXT,
  value TEXT,
  expires_at INTEGER,
  created_at INTEGER,
  updated_at INTEGER
);
CREATE TABLE interest_signup (
  id TEXT PRIMARY KEY,
  email TEXT,
  source TEXT,
  created_at INTEGER
);
CREATE TABLE session (
  id TEXT PRIMARY KEY,
  expires_at INTEGER,
  token TEXT,
  created_at INTEGER,
  updated_at INTEGER,
  ip_address TEXT,
  user_agent TEXT,
  user_id TEXT,
  active_organization_id TEXT
);
CREATE TABLE account (
  id TEXT PRIMARY KEY,
  account_id TEXT,
  provider_id TEXT,
  user_id TEXT,
  access_token TEXT,
  refresh_token TEXT,
  id_token TEXT,
  access_token_expires_at INTEGER,
  refresh_token_expires_at INTEGER,
  scope TEXT,
  password TEXT,
  created_at INTEGER,
  updated_at INTEGER
);
CREATE TABLE mobile_refresh_token (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  organization_id TEXT,
  token_hash TEXT,
  family_id TEXT,
  expires_at INTEGER,
  revoked_at INTEGER,
  created_at INTEGER
);
CREATE TABLE mobile_auth_code (
  code TEXT PRIMARY KEY,
  user_id TEXT,
  organization_id TEXT,
  code_challenge TEXT,
  expires_at INTEGER,
  consumed_at INTEGER,
  created_at INTEGER
);
CREATE TABLE oauthAccessToken (
  id TEXT PRIMARY KEY,
  token TEXT,
  client_id TEXT,
  session_id TEXT,
  refresh_id TEXT,
  user_id TEXT,
  reference_id TEXT,
  scopes TEXT,
  created_at INTEGER,
  expires_at INTEGER
);
CREATE TABLE oauthRefreshToken (
  id TEXT PRIMARY KEY,
  token TEXT,
  client_id TEXT,
  session_id TEXT,
  user_id TEXT NOT NULL,
  reference_id TEXT,
  scopes TEXT,
  revoked INTEGER,
  auth_time INTEGER,
  created_at INTEGER,
  expires_at INTEGER
);
CREATE TABLE oauthConsent (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  client_id TEXT,
  reference_id TEXT,
  scopes TEXT,
  created_at INTEGER,
  updated_at INTEGER
);
CREATE TABLE oauthClient (
  id TEXT PRIMARY KEY,
  client_id TEXT,
  client_secret TEXT,
  disabled INTEGER,
  skip_consent INTEGER,
  enable_end_session INTEGER,
  subject_type TEXT,
  scopes TEXT,
  user_id TEXT,
  reference_id TEXT,
  created_at INTEGER,
  updated_at INTEGER,
  name TEXT,
  uri TEXT,
  icon TEXT,
  contacts TEXT,
  tos TEXT,
  policy TEXT,
  software_id TEXT,
  software_version TEXT,
  software_statement TEXT,
  redirect_uris TEXT,
  post_logout_redirect_uris TEXT,
  token_endpoint_auth_method TEXT,
  grant_types TEXT,
  response_types TEXT,
  public INTEGER,
  type TEXT,
  require_pkce INTEGER,
  metadata TEXT
);
CREATE TABLE nutrition_consent (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  organization_id TEXT,
  status TEXT,
  policy_version TEXT,
  granted_at INTEGER,
  revoked_at INTEGER,
  created_at INTEGER,
  updated_at INTEGER,
  statement_json TEXT,
  ip_hash TEXT,
  user_agent_hash TEXT,
  source TEXT,
  request_id TEXT,
  retention_until INTEGER,
  metadata TEXT
);
`;

describe("purgeUserAccount OAuth wipe", () => {
	const { database, sqlite } = createSqliteD1();
	const env = createMockEnv();
	env.DB = database;

	beforeEach(() => {
		sqlite.exec(`
DROP TABLE IF EXISTS nutrition_consent;
DROP TABLE IF EXISTS oauthClient;
DROP TABLE IF EXISTS oauthConsent;
DROP TABLE IF EXISTS oauthRefreshToken;
DROP TABLE IF EXISTS oauthAccessToken;
DROP TABLE IF EXISTS mobile_auth_code;
DROP TABLE IF EXISTS mobile_refresh_token;
DROP TABLE IF EXISTS account;
DROP TABLE IF EXISTS session;
DROP TABLE IF EXISTS interest_signup;
DROP TABLE IF EXISTS verification;
DROP TABLE IF EXISTS api_key;
DROP TABLE IF EXISTS kitchen_event;
DROP TABLE IF EXISTS ledger;
DROP TABLE IF EXISTS agent_registration;
DROP TABLE IF EXISTS invitation;
DROP TABLE IF EXISTS member;
DROP TABLE IF EXISTS organization;
DROP TABLE IF EXISTS user;
`);
		sqlite.exec(DDL);
		sqlite
			.prepare("INSERT INTO user (id, name, email) VALUES (?, ?, ?)")
			.run("user-1", "Test", "t@example.com");
		sqlite
			.prepare(
				"INSERT INTO oauthAccessToken (id, token, client_id, user_id, scopes, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
			)
			.run("oa-1", "tok", "c1", "user-1", "[]", 1, 2);
		sqlite
			.prepare(
				"INSERT INTO oauthRefreshToken (id, token, client_id, user_id, scopes, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
			)
			.run("or-1", "rtok", "c1", "user-1", "[]", 1, 2);
		sqlite
			.prepare(
				"INSERT INTO oauthConsent (id, user_id, client_id, scopes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
			)
			.run("oc-1", "user-1", "c1", "[]", 1, 1);
		sqlite
			.prepare(
				"INSERT INTO oauthClient (id, client_id, user_id, redirect_uris) VALUES (?, ?, ?, ?)",
			)
			.run("ocl-1", "client-1", "user-1", "[]");
	});

	it("deletes OAuth artifacts for the user", async () => {
		const { purgeUserAccount } = await import("~/lib/user-purge.server");
		await purgeUserAccount(env, { userId: "user-1", email: "t@example.com" });

		expect(
			sqlite.prepare("SELECT COUNT(*) AS c FROM oauthAccessToken").get() as {
				c: number;
			},
		).toEqual({ c: 0 });
		expect(
			sqlite.prepare("SELECT COUNT(*) AS c FROM oauthRefreshToken").get() as {
				c: number;
			},
		).toEqual({ c: 0 });
		expect(
			sqlite.prepare("SELECT COUNT(*) AS c FROM oauthConsent").get() as {
				c: number;
			},
		).toEqual({ c: 0 });
		expect(
			sqlite.prepare("SELECT COUNT(*) AS c FROM oauthClient").get() as {
				c: number;
			},
		).toEqual({ c: 0 });
		expect(
			sqlite.prepare("SELECT COUNT(*) AS c FROM user").get() as { c: number },
		).toEqual({ c: 0 });
	});
});
