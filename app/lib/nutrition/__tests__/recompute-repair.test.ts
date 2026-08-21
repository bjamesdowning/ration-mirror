import { afterEach, describe, expect, it, vi } from "vitest";
import { createSqliteD1 } from "~/test/helpers/sqlite-d1";
import {
	markJobFailed,
	nutritionRecomputeRetryDelayMs,
	REPAIR_BATCH_LIMIT,
	repairDueNutritionRecomputeJobs,
} from "../recompute-consumer.server";

const databases: Array<ReturnType<typeof createSqliteD1>["sqlite"]> = [];

afterEach(() => {
	for (const database of databases.splice(0)) database.close();
});

const NOW = new Date("2026-08-21T12:00:00.000Z");
const NOW_UNIX = Math.floor(NOW.getTime() / 1000);

function setup() {
	const { database, sqlite } = createSqliteD1();
	databases.push(sqlite);
	sqlite.exec(`
CREATE TABLE nutrition_recompute_job (
  job_key TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  trigger TEXT NOT NULL,
  requested_revision INTEGER NOT NULL DEFAULT 1,
  processing_revision INTEGER,
  completed_revision INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  dispatch_after INTEGER NOT NULL,
  last_dispatched_at INTEGER,
  lease_token TEXT,
  lease_expires_at INTEGER,
  last_error_code TEXT,
  sweep_cursor TEXT,
  originating_surface TEXT NOT NULL,
  originating_user_id TEXT,
  originating_client_version TEXT,
  originating_country TEXT,
  originating_environment TEXT,
  originating_plan TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  completed_at INTEGER,
  expires_at INTEGER
);
`);
	const send = vi.fn().mockResolvedValue(undefined);
	const env = {
		DB: database,
		NUTRITION_RECOMPUTE_QUEUE: { send },
	} as unknown as Env;
	return { sqlite, env, send };
}

function insertJob(
	sqlite: ReturnType<typeof createSqliteD1>["sqlite"],
	row: {
		jobKey: string;
		status: string;
		dispatchAfter: number;
		leaseExpiresAt?: number | null;
		leaseToken?: string | null;
		expiresAt?: number | null;
		attemptCount?: number;
	},
): void {
	sqlite
		.prepare(
			`INSERT INTO nutrition_recompute_job (
        job_key, organization_id, subject_type, subject_id, trigger,
        status, attempt_count, dispatch_after, originating_surface,
        created_at, updated_at, lease_expires_at, lease_token, expires_at
      ) VALUES (?, 'org-1', 'meal', 'meal-1', 'repair', ?, ?, ?, 'system', ?, ?, ?, ?, ?)`,
		)
		.run(
			row.jobKey,
			row.status,
			row.attemptCount ?? 0,
			row.dispatchAfter,
			NOW_UNIX,
			NOW_UNIX,
			row.leaseExpiresAt ?? null,
			row.leaseToken ?? null,
			row.expiresAt ?? null,
		);
}

describe("nutritionRecomputeRetryDelayMs", () => {
	it("uses 30s * 2^attempt capped at 15 minutes", () => {
		expect(nutritionRecomputeRetryDelayMs(0)).toBe(30_000);
		expect(nutritionRecomputeRetryDelayMs(1)).toBe(60_000);
		expect(nutritionRecomputeRetryDelayMs(2)).toBe(120_000);
		expect(nutritionRecomputeRetryDelayMs(8)).toBe(15 * 60_000);
		expect(nutritionRecomputeRetryDelayMs(12)).toBe(15 * 60_000);
	});
});

describe("repairDueNutritionRecomputeJobs", () => {
	it("wakes due pending jobs and skips future dispatch_after", async () => {
		const { sqlite, env, send } = setup();
		insertJob(sqlite, {
			jobKey: "due",
			status: "pending",
			dispatchAfter: NOW_UNIX - 10,
		});
		insertJob(sqlite, {
			jobKey: "later",
			status: "pending",
			dispatchAfter: NOW_UNIX + 3_600,
		});

		const sent = await repairDueNutritionRecomputeJobs(env, NOW);
		expect(sent).toBe(1);
		expect(send).toHaveBeenCalledTimes(1);
		expect(send.mock.calls[0]?.[0]).toMatchObject({ jobKey: "due" });
	});

	it("recovers expired leases and skips unexpired processing jobs", async () => {
		const { sqlite, env, send } = setup();
		insertJob(sqlite, {
			jobKey: "expired-lease",
			status: "processing",
			dispatchAfter: NOW_UNIX - 10,
			leaseExpiresAt: NOW_UNIX - 1,
			leaseToken: "lease-old",
		});
		insertJob(sqlite, {
			jobKey: "live-lease",
			status: "processing",
			dispatchAfter: NOW_UNIX - 10,
			leaseExpiresAt: NOW_UNIX + 120,
			leaseToken: "lease-live",
		});

		const sent = await repairDueNutritionRecomputeJobs(env, NOW);
		expect(sent).toBe(1);
		expect(send.mock.calls[0]?.[0]).toMatchObject({ jobKey: "expired-lease" });

		const live = sqlite
			.prepare(
				"SELECT status, lease_token FROM nutrition_recompute_job WHERE job_key = ?",
			)
			.get("live-lease") as { status: string; lease_token: string };
		expect(live).toEqual({ status: "processing", lease_token: "lease-live" });
	});

	it("skips failed jobs whose dispatch_after is still in the future", async () => {
		const { sqlite, env, send } = setup();
		insertJob(sqlite, {
			jobKey: "failed-due",
			status: "failed",
			dispatchAfter: NOW_UNIX - 1,
			expiresAt: NOW_UNIX + 86_400,
		});
		insertJob(sqlite, {
			jobKey: "failed-backoff",
			status: "failed",
			dispatchAfter: NOW_UNIX + 60,
			expiresAt: NOW_UNIX + 86_400,
		});

		const sent = await repairDueNutritionRecomputeJobs(env, NOW);
		expect(sent).toBe(1);
		expect(send.mock.calls[0]?.[0]).toMatchObject({ jobKey: "failed-due" });
	});

	it(`caps unique wakes at ${REPAIR_BATCH_LIMIT}`, async () => {
		const { sqlite, env, send } = setup();
		for (let i = 0; i < REPAIR_BATCH_LIMIT + 5; i++) {
			insertJob(sqlite, {
				jobKey: `pending-${i}`,
				status: "pending",
				dispatchAfter: NOW_UNIX - 1,
			});
		}

		const sent = await repairDueNutritionRecomputeJobs(env, NOW);
		expect(sent).toBe(REPAIR_BATCH_LIMIT);
		expect(send).toHaveBeenCalledTimes(REPAIR_BATCH_LIMIT);
	});
});

describe("markJobFailed", () => {
	it("sets dispatch_after in the future from attempt backoff", async () => {
		const { sqlite, env } = setup();
		insertJob(sqlite, {
			jobKey: "fail-me",
			status: "processing",
			dispatchAfter: NOW_UNIX,
			leaseExpiresAt: NOW_UNIX + 120,
			leaseToken: "lease-1",
			attemptCount: 2,
			expiresAt: NOW_UNIX + 86_400,
		});

		await markJobFailed(env, "fail-me", "lease-1", "transient_error", 2, NOW);

		const row = sqlite
			.prepare(
				"SELECT status, dispatch_after, lease_token FROM nutrition_recompute_job WHERE job_key = ?",
			)
			.get("fail-me") as {
			status: string;
			dispatch_after: number;
			lease_token: string | null;
		};
		expect(row.status).toBe("failed");
		expect(row.lease_token).toBeNull();
		expect(row.dispatch_after).toBe(
			NOW_UNIX + nutritionRecomputeRetryDelayMs(2) / 1000,
		);
		expect(row.dispatch_after).toBeGreaterThan(NOW_UNIX);
	});
});
