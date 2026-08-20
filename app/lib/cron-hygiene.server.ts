/**
 * Bounded daily D1 hygiene so 03:00 cron cannot timeout a full-table DELETE
 * and starve account-purge retry on the same isolate.
 */

import { log } from "~/lib/logging.server";
import { retryFailedPurgeJobs } from "~/lib/purge-retry-cron.server";

export const CRON_EXPIRED_ROW_DELETE_BATCH = 500;
export const CRON_EXPIRED_ROW_DELETE_MAX_ROUNDS = 40;

export const EXPIRED_SESSION_DELETE_SQL = `DELETE FROM session WHERE id IN (
  SELECT id FROM session WHERE expires_at < ?1 ORDER BY expires_at ASC LIMIT ?2
)`;

export const EXPIRED_QUEUE_JOB_DELETE_SQL = `DELETE FROM queue_job WHERE request_id IN (
  SELECT request_id FROM queue_job WHERE expires_at < ?1 ORDER BY expires_at ASC LIMIT ?2
)`;

export async function deleteExpiredRowsInBatches(
	db: D1Database,
	sql: string,
	cutoffUnix: number,
	options?: { batchSize?: number; maxRounds?: number },
): Promise<number> {
	const batchSize = options?.batchSize ?? CRON_EXPIRED_ROW_DELETE_BATCH;
	const maxRounds = options?.maxRounds ?? CRON_EXPIRED_ROW_DELETE_MAX_ROUNDS;
	let total = 0;
	for (let round = 0; round < maxRounds; round++) {
		const result = await db.prepare(sql).bind(cutoffUnix, batchSize).run();
		const deleted = result.meta?.changes ?? 0;
		total += deleted;
		if (deleted < batchSize) break;
		if (round === maxRounds - 1) {
			log.warn(
				"[CRON] Expired-row delete hit max rounds; remaining rows wait until next run",
				{
					maxRounds,
					batchSize,
					deleted: total,
				},
			);
		}
	}
	return total;
}

export async function purgeExpiredSessions(
	env: Cloudflare.Env,
): Promise<number> {
	const nowUnix = Math.floor(Date.now() / 1000);
	try {
		const deleted = await deleteExpiredRowsInBatches(
			env.DB,
			EXPIRED_SESSION_DELETE_SQL,
			nowUnix,
		);
		if (deleted > 0) {
			log.info("[CRON] Purged expired sessions", { deleted });
		}
		return deleted;
	} catch (err) {
		log.error("[CRON] Session purge failed", err, {
			event: "cron_purge_failed",
		});
		return 0;
	}
}

export async function purgeExpiredQueueJobs(
	env: Cloudflare.Env,
): Promise<number> {
	const nowUnix = Math.floor(Date.now() / 1000);
	try {
		const deleted = await deleteExpiredRowsInBatches(
			env.DB,
			EXPIRED_QUEUE_JOB_DELETE_SQL,
			nowUnix,
		);
		if (deleted > 0) {
			log.info("[CRON] Purged expired queue jobs", { deleted });
		}
		return deleted;
	} catch (err) {
		log.error("[CRON] Queue job purge failed", err, {
			event: "cron_purge_failed",
		});
		return 0;
	}
}

/** Session + queue hygiene first, then GDPR purge retry — one D1 writer at a time. */
export async function runDailyD1HygieneThenPurgeRetry(
	env: Cloudflare.Env,
): Promise<void> {
	await purgeExpiredSessions(env);
	await purgeExpiredQueueJobs(env);
	await retryFailedPurgeJobs(env);
}
