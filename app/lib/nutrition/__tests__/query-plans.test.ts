/**
 * EXPLAIN QUERY PLAN gates for nutrition summary / retention / recompute due.
 * Fails if SQLite chooses a full table scan for the hot paths.
 */
import { describe, expect, it } from "vitest";
import { createSqliteD1 } from "~/test/helpers/sqlite-d1";

async function explain(db: D1Database, sql: string): Promise<string> {
	const rows = await db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all<{
		detail: string;
	}>();
	return (rows.results ?? []).map((r) => r.detail).join("\n");
}

function assertNoFullScan(plan: string): void {
	expect(plan.toLowerCase()).not.toMatch(/scan table nutrition_intake\b/);
	expect(plan.toLowerCase()).not.toMatch(
		/scan table nutrition_recompute_job\b/,
	);
}

describe("nutrition query plans", () => {
	it("summary history uses the active intake partial index", async () => {
		const { database: db } = createSqliteD1();
		await db
			.prepare(
				`CREATE TABLE nutrition_intake (
          id TEXT PRIMARY KEY,
          organization_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          manifest_date TEXT NOT NULL,
          energy_kcal REAL NOT NULL,
          protein_g REAL NOT NULL,
          carbs_g REAL NOT NULL,
          fat_g REAL NOT NULL,
          coverage REAL NOT NULL,
          source TEXT NOT NULL,
          confidence REAL NOT NULL,
          verified INTEGER NOT NULL DEFAULT 0,
          occurred_at INTEGER NOT NULL,
          fiber_g REAL,
          nutrients_json TEXT,
          voided_at INTEGER
        )`,
			)
			.run();
		await db
			.prepare(
				`CREATE INDEX nutrition_intake_user_history_idx
         ON nutrition_intake (user_id, organization_id, manifest_date, occurred_at, id)
         WHERE voided_at IS NULL`,
			)
			.run();

		const plan = await explain(
			db,
			`SELECT manifest_date,
        coalesce(sum(energy_kcal), 0),
        case when count(coalesce(fiber_g, json_extract(nutrients_json, '$.fiberG'))) > 0
          then sum(coalesce(fiber_g, json_extract(nutrients_json, '$.fiberG')))
          else null end
       FROM nutrition_intake
       WHERE user_id = 'u1'
         AND organization_id = 'o1'
         AND manifest_date >= '2026-01-01'
         AND manifest_date <= '2026-01-31'
         AND voided_at IS NULL
       GROUP BY manifest_date`,
		);
		expect(plan.toLowerCase()).toMatch(
			/nutrition_intake_user_history_idx|using index|covering/,
		);
		assertNoFullScan(plan);
	});

	it("retention delete probes the occurred_at index", async () => {
		const { database: db } = createSqliteD1();
		await db
			.prepare(
				`CREATE TABLE nutrition_intake (
          id TEXT PRIMARY KEY,
          occurred_at INTEGER NOT NULL
        )`,
			)
			.run();
		await db
			.prepare(
				`CREATE INDEX nutrition_intake_retention_idx ON nutrition_intake (occurred_at)`,
			)
			.run();

		const plan = await explain(
			db,
			`SELECT id FROM nutrition_intake WHERE occurred_at < 1 ORDER BY occurred_at ASC LIMIT 250`,
		);
		expect(plan.toLowerCase()).toMatch(
			/nutrition_intake_retention_idx|using index/,
		);
		assertNoFullScan(plan);
	});

	it("recompute due jobs use the due index", async () => {
		const { database: db } = createSqliteD1();
		await db
			.prepare(
				`CREATE TABLE nutrition_recompute_job (
          job_key TEXT PRIMARY KEY,
          status TEXT NOT NULL,
          dispatch_after INTEGER NOT NULL
        )`,
			)
			.run();
		await db
			.prepare(
				`CREATE INDEX nutrition_recompute_due_idx
         ON nutrition_recompute_job (status, dispatch_after, job_key)`,
			)
			.run();

		const plan = await explain(
			db,
			`SELECT job_key FROM nutrition_recompute_job
       WHERE status = 'pending' AND dispatch_after <= 1
       ORDER BY dispatch_after ASC LIMIT 25`,
		);
		expect(plan.toLowerCase()).toMatch(
			/nutrition_recompute_due_idx|using index/,
		);
		assertNoFullScan(plan);
	});
});
