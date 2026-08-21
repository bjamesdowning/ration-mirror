import { describe, expect, it } from "vitest";
import { createSqliteD1 } from "~/test/helpers/sqlite-d1";
import {
	CRON_EXPIRED_ROW_DELETE_BATCH,
	deleteExpiredRowsInBatches,
	EXPIRED_QUEUE_JOB_DELETE_SQL,
	EXPIRED_SESSION_DELETE_SQL,
} from "../cron-hygiene.server";
import {
	EXPIRED_NUTRITION_INTAKE_DELETE_SQL,
	EXPIRED_NUTRITION_RECOMPUTE_JOB_DELETE_SQL,
} from "../nutrition/persist.server";

describe("bounded expired-row deletes", () => {
	it("uses subquery LIMIT rather than unbounded DELETE", () => {
		expect(EXPIRED_SESSION_DELETE_SQL).toMatch(
			/DELETE FROM session WHERE id IN/i,
		);
		expect(EXPIRED_SESSION_DELETE_SQL).toMatch(/LIMIT \?2/i);
		expect(EXPIRED_QUEUE_JOB_DELETE_SQL).toMatch(
			/DELETE FROM queue_job WHERE request_id IN/i,
		);
		expect(EXPIRED_QUEUE_JOB_DELETE_SQL).toMatch(/LIMIT \?2/i);
		expect(CRON_EXPIRED_ROW_DELETE_BATCH).toBe(500);
		expect(EXPIRED_NUTRITION_INTAKE_DELETE_SQL).toContain(
			"DELETE FROM nutrition_intake",
		);
		expect(EXPIRED_NUTRITION_INTAKE_DELETE_SQL).toContain("WHERE id IN");
		expect(EXPIRED_NUTRITION_INTAKE_DELETE_SQL).toMatch(/LIMIT \?2/i);
		expect(EXPIRED_NUTRITION_RECOMPUTE_JOB_DELETE_SQL).toContain(
			"DELETE FROM nutrition_recompute_job",
		);
		expect(EXPIRED_NUTRITION_RECOMPUTE_JOB_DELETE_SQL).toContain(
			"WHERE job_key IN",
		);
		expect(EXPIRED_NUTRITION_RECOMPUTE_JOB_DELETE_SQL).toMatch(/LIMIT \?3/i);
	});

	it("deletes expired sessions in batches until the table is clean", async () => {
		const { database, sqlite } = createSqliteD1();
		sqlite.exec(`
CREATE TABLE session (
  id TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);
`);
		const insert = sqlite.prepare(
			"INSERT INTO session (id, expires_at) VALUES (?, ?)",
		);
		insert.run("s1", 1);
		insert.run("s2", 1);
		insert.run("s3", 1);
		insert.run("live", 9_999_999);

		const deleted = await deleteExpiredRowsInBatches(
			database,
			EXPIRED_SESSION_DELETE_SQL,
			100,
			{ batchSize: 2, maxRounds: 10 },
		);

		expect(deleted).toBe(3);
		expect(
			sqlite.prepare("SELECT id FROM session").all() as Array<{ id: string }>,
		).toEqual([{ id: "live" }]);
	});

	it("stops after maxRounds even when expired rows remain", async () => {
		const { database, sqlite } = createSqliteD1();
		sqlite.exec(`
CREATE TABLE session (
  id TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);
`);
		const insert = sqlite.prepare(
			"INSERT INTO session (id, expires_at) VALUES (?, ?)",
		);
		insert.run("s1", 1);
		insert.run("s2", 1);
		insert.run("s3", 1);

		const deleted = await deleteExpiredRowsInBatches(
			database,
			EXPIRED_SESSION_DELETE_SQL,
			100,
			{ batchSize: 1, maxRounds: 2 },
		);

		expect(deleted).toBe(2);
		expect(
			sqlite.prepare("SELECT COUNT(*) AS c FROM session").get() as {
				c: number;
			},
		).toEqual({ c: 1 });
	});
});
