/**
 * D1-backed queue job status. Strong read-after-write consistency (unlike KV).
 * Used for scan and meal-generate polling.
 *
 * Idempotency: consumers call `runIdempotentAiJob` so queue retries after a
 * successful terminal write do not re-invoke Gemini (SR-001).
 */
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { log } from "./logging.server";

const JOB_TTL_SECONDS = 3600; // 1 hour

export type QueueJobType =
	| "scan"
	| "meal_generate"
	| "plan_week"
	| "import_url";
export type QueueJobStatus = "pending" | "processing" | "completed" | "failed";

/** Client-facing status: `processing` is reported as `pending` so polls continue. */
export type QueueJobClientStatus = "pending" | "completed" | "failed";

export function toClientQueueJobStatus(
	status: QueueJobStatus,
): QueueJobClientStatus {
	return status === "processing" ? "pending" : status;
}

export function isTerminalQueueJobStatus(
	status: QueueJobStatus,
): status is "completed" | "failed" {
	return status === "completed" || status === "failed";
}

/** Insert pending job. Call from producer after enqueue. */
export async function insertQueueJobPending(
	db: D1Database,
	requestId: string,
	jobType: QueueJobType,
	organizationId: string,
): Promise<void> {
	const now = Math.floor(Date.now() / 1000);
	const d1 = drizzle(db);
	await d1.insert(schema.queueJob).values({
		requestId,
		jobType,
		organizationId,
		status: "pending",
		resultJson: null,
		expiresAt: new Date((now + JOB_TTL_SECONDS) * 1000),
	});
}

/**
 * Atomically claim a pending job for processing (`pending` → `processing`).
 * Returns true when this isolate won the claim.
 */
export async function claimQueueJobForProcessing(
	db: D1Database,
	requestId: string,
): Promise<boolean> {
	const result = await db
		.prepare(
			"UPDATE queue_job SET status = 'processing' WHERE request_id = ? AND status = 'pending'",
		)
		.bind(requestId)
		.run();
	return (result.meta.changes ?? 0) > 0;
}

/**
 * Update job with final result. Call from consumer.
 * Only transitions from `pending`/`processing` so a late retry cannot clobber
 * an already-terminal status (and must not trigger a second refund).
 * @returns true when the row was updated
 */
export async function updateQueueJobResult(
	db: D1Database,
	requestId: string,
	status: "completed" | "failed",
	result: object,
): Promise<boolean> {
	const write = await db
		.prepare(
			"UPDATE queue_job SET status = ?, result_json = ? WHERE request_id = ? AND status IN ('pending', 'processing')",
		)
		.bind(status, JSON.stringify(result), requestId)
		.run();
	return (write.meta.changes ?? 0) > 0;
}

/** Fetch job by requestId. Returns null if not found or expired. */
export async function getQueueJob(
	db: D1Database,
	requestId: string,
): Promise<{
	status: QueueJobStatus;
	organizationId: string;
	resultJson: string | null;
	expiresAt: number;
} | null> {
	const d1 = drizzle(db);
	const rows = await d1
		.select({
			status: schema.queueJob.status,
			organizationId: schema.queueJob.organizationId,
			resultJson: schema.queueJob.resultJson,
			expiresAt: schema.queueJob.expiresAt,
		})
		.from(schema.queueJob)
		.where(eq(schema.queueJob.requestId, requestId))
		.limit(1);

	const row = rows[0];
	if (!row) return null;
	const expiresAtMs =
		row.expiresAt instanceof Date
			? row.expiresAt.getTime()
			: Number(row.expiresAt) * 1000;
	if (expiresAtMs < Date.now()) return null;
	return {
		status: row.status as QueueJobStatus,
		organizationId: row.organizationId,
		resultJson: row.resultJson,
		expiresAt: Math.floor(expiresAtMs / 1000),
	};
}

export type IdempotentAiJobOutcome =
	| { ran: false; reason: "terminal" }
	| { ran: true; claimed: boolean };

export interface IdempotentAiJobDeps {
	getQueueJob: typeof getQueueJob;
	claimQueueJobForProcessing: typeof claimQueueJobForProcessing;
}

/**
 * Guard for AI queue consumers: skip work when the job is already terminal,
 * claim `pending` → `processing` when possible, then run `work`.
 *
 * Missing/expired jobs throw so the queue message is retried (producers insert
 * the row after enqueue; a fast consumer must not ack-and-drop).
 *
 * Re-entry while `processing` (crash / unacked retry) still runs `work` so the
 * job cannot stick forever. Terminal writes use conditional UPDATE so a late
 * peer cannot clobber completed/failed.
 */
export async function runIdempotentAiJob(
	db: D1Database,
	requestId: string,
	work: () => Promise<void>,
	deps: IdempotentAiJobDeps = {
		getQueueJob,
		claimQueueJobForProcessing,
	},
): Promise<IdempotentAiJobOutcome> {
	const existing = await deps.getQueueJob(db, requestId);
	if (!existing) {
		// Do not ack — row may still be inserting (send-before-insert race) or
		// temporarily unreadable. Retry preserves credits + eventual execution.
		throw new Error(`AI queue job missing or expired: ${requestId}`);
	}
	if (isTerminalQueueJobStatus(existing.status)) {
		log.info("AI queue job already terminal; skipping consumer work", {
			requestId,
			status: existing.status,
		});
		return { ran: false, reason: "terminal" };
	}

	const claimed = await deps.claimQueueJobForProcessing(db, requestId);
	if (!claimed) {
		// Race: another isolate may have finished while we claimed, or status is
		// already processing (re-entry). Re-check terminal before spending.
		const again = await deps.getQueueJob(db, requestId);
		if (!again) {
			throw new Error(`AI queue job missing after claim: ${requestId}`);
		}
		if (isTerminalQueueJobStatus(again.status)) {
			log.info("AI queue job became terminal during claim; skipping", {
				requestId,
				status: again.status,
			});
			return { ran: false, reason: "terminal" };
		}
	}

	await work();
	return { ran: true, claimed };
}
