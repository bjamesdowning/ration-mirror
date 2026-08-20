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
  claimed_by_user_id TEXT
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
  created_at INTEGER
);
CREATE TABLE api_key (
  id TEXT PRIMARY KEY,
  user_id TEXT
);
CREATE TABLE verification (
  id TEXT PRIMARY KEY,
  identifier TEXT
);
CREATE TABLE interest_signup (
  id TEXT PRIMARY KEY,
  email TEXT
);
CREATE TABLE session (
  id TEXT PRIMARY KEY,
  expires_at INTEGER,
  token TEXT,
  created_at INTEGER,
  updated_at INTEGER,
  user_id TEXT,
  active_organization_id TEXT
);
CREATE TABLE account (
  id TEXT PRIMARY KEY,
  user_id TEXT
);
CREATE TABLE mobile_refresh_token (
  id TEXT PRIMARY KEY,
  user_id TEXT
);
CREATE TABLE mobile_auth_code (
  code TEXT PRIMARY KEY,
  user_id TEXT
);
CREATE TABLE oauthAccessToken (
  id TEXT PRIMARY KEY,
  user_id TEXT
);
CREATE TABLE oauthRefreshToken (
  id TEXT PRIMARY KEY,
  user_id TEXT
);
CREATE TABLE oauthConsent (
  id TEXT PRIMARY KEY,
  user_id TEXT
);
CREATE TABLE oauthClient (
  id TEXT PRIMARY KEY,
  user_id TEXT
);
CREATE TABLE nutrition_consent (
  id TEXT PRIMARY KEY,
  user_id TEXT
);
CREATE TABLE meal_plan_entry (
  id TEXT PRIMARY KEY,
  cooked_by_user_id TEXT REFERENCES user(id)
);
CREATE TABLE ingredient_nutrition_match (
  id TEXT PRIMARY KEY,
  reviewed_by_user_id TEXT
);
CREATE TABLE nutrition_intake (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  voided_by_user_id TEXT
);
CREATE TABLE nutrition_recompute_job (
  job_key TEXT PRIMARY KEY,
  originating_user_id TEXT
);
CREATE TABLE tag (
  id TEXT PRIMARY KEY,
  created_by TEXT
);
`;

describe("purgeUserAccount leftover user FKs", () => {
	const { database, sqlite } = createSqliteD1();
	const env = createMockEnv();
	env.DB = database;

	beforeEach(() => {
		sqlite.exec(`
DROP TABLE IF EXISTS tag;
DROP TABLE IF EXISTS nutrition_recompute_job;
DROP TABLE IF EXISTS nutrition_intake;
DROP TABLE IF EXISTS ingredient_nutrition_match;
DROP TABLE IF EXISTS meal_plan_entry;
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
		sqlite.exec("pragma foreign_keys = on");
		sqlite.exec(DDL);
		sqlite
			.prepare("INSERT INTO user (id, name, email) VALUES (?, ?, ?)")
			.run("user-1", "Test", "t@example.com");
		sqlite
			.prepare(
				"INSERT INTO meal_plan_entry (id, cooked_by_user_id) VALUES (?, ?)",
			)
			.run("mpe-1", "user-1");
		sqlite
			.prepare("INSERT INTO tag (id, created_by) VALUES (?, ?)")
			.run("tag-1", "user-1");
		sqlite
			.prepare(
				"INSERT INTO nutrition_recompute_job (job_key, originating_user_id) VALUES (?, ?)",
			)
			.run("job-1", "user-1");
	});

	it("nulls leftover cooked_by rows so DELETE user succeeds", async () => {
		const { purgeUserAccount } = await import("~/lib/user-purge.server");
		await purgeUserAccount(env, { userId: "user-1", email: "t@example.com" });

		expect(
			sqlite.prepare("SELECT COUNT(*) AS c FROM user").get() as { c: number },
		).toEqual({ c: 0 });
		expect(
			sqlite
				.prepare("SELECT cooked_by_user_id AS id FROM meal_plan_entry")
				.get() as { id: string | null },
		).toEqual({ id: null });
		expect(
			sqlite.prepare("SELECT created_by AS id FROM tag").get() as {
				id: string | null;
			},
		).toEqual({ id: null });
	});

	it("wrapUserPurgeStep includes nested Drizzle cause text", async () => {
		const { wrapUserPurgeStep } = await import("~/lib/user-purge.server");
		const cause = new Error("FOREIGN KEY constraint failed");
		const wrapped = new Error('Failed query: delete from "user"');
		wrapped.cause = cause;
		const stepped = wrapUserPurgeStep("user_wipe:d1", wrapped);
		expect(stepped.message).toContain("user_wipe:d1");
		expect(stepped.message).toContain("Failed query");
		expect(stepped.message).toContain("FOREIGN KEY constraint failed");
	});
});
