import { afterEach, describe, expect, it } from "vitest";
import { createSqliteD1 } from "~/test/helpers/sqlite-d1";
import { grantNutritionConsent } from "../consent.server";
import { getNutritionConsentStatement } from "../consent-policy";

const databases: Array<ReturnType<typeof createSqliteD1>["sqlite"]> = [];

afterEach(() => {
	for (const database of databases.splice(0)) database.close();
});

function setupConsentDb() {
	const { database, sqlite } = createSqliteD1();
	databases.push(sqlite);
	sqlite.exec(`
		CREATE TABLE nutrition_consent (
			id TEXT PRIMARY KEY,
			user_id TEXT NOT NULL,
			purpose TEXT NOT NULL,
			policy_version TEXT NOT NULL,
			statement_version TEXT,
			statement_sha256 TEXT,
			privacy_notice_version TEXT,
			source TEXT NOT NULL,
			client_surface TEXT,
			client_version TEXT,
			locale TEXT,
			request_id TEXT,
			withdraw_request_id TEXT,
			granted_at INTEGER NOT NULL,
			withdrawn_at INTEGER,
			created_at INTEGER NOT NULL
		);
		CREATE UNIQUE INDEX nutrition_consent_active_uidx
			ON nutrition_consent (user_id, purpose, policy_version)
			WHERE withdrawn_at IS NULL;
		CREATE UNIQUE INDEX nutrition_consent_user_request_uidx
			ON nutrition_consent (user_id, request_id)
			WHERE request_id IS NOT NULL;
	`);
	return database;
}

describe("grantNutritionConsent integration", () => {
	it("grants and replays by request_id against real SQLite", async () => {
		const db = setupConsentDb();
		const statement = await getNutritionConsentStatement("intake");
		const input = {
			userId: "u1",
			purpose: "intake" as const,
			source: "web" as const,
			policyVersion: statement.policyVersion,
			statementVersion: statement.statementVersion,
			statementSha256: statement.sha256,
			affirmed: true as const,
			clientSurface: "web_privacy_settings",
			clientVersion: "1.8.4",
			locale: "en-IE",
			requestId: "11111111-1111-4111-8111-111111111111",
		};
		const first = await grantNutritionConsent(db, input);
		const replay = await grantNutritionConsent(db, input);
		expect(replay.id).toBe(first.id);
		expect(replay.purpose).toBe("intake");
	});

	it("returns the active row when a second request races the same purpose/policy", async () => {
		const db = setupConsentDb();
		const statement = await getNutritionConsentStatement("goals");
		const base = {
			userId: "u1",
			purpose: "goals" as const,
			source: "web" as const,
			policyVersion: statement.policyVersion,
			statementVersion: statement.statementVersion,
			statementSha256: statement.sha256,
			affirmed: true as const,
			clientSurface: "web_privacy_settings",
		};
		const first = await grantNutritionConsent(db, {
			...base,
			requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
		});
		const second = await grantNutritionConsent(db, {
			...base,
			requestId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
		});
		expect(second.id).toBe(first.id);
	});
});
