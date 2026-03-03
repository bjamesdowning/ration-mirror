/**
 * D1-backed queue job status. Strong read-after-write consistency (unlike KV).
 * Used for scan and meal-generate polling.
 */
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";

const JOB_TTL_SECONDS = 3600; // 1 hour

export type QueueJobType =
	| "scan"
	| "meal_generate"
	| "plan_week"
	| "import_url";
export type QueueJobStatus = "pending" | "completed" | "failed";

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

/** Update job with final result. Call from consumer. */
export async function updateQueueJobResult(
	db: D1Database,
	requestId: string,
	status: "completed" | "failed",
	result: object,
): Promise<void> {
	const d1 = drizzle(db);
	await d1
		.update(schema.queueJob)
		.set({ status, resultJson: JSON.stringify(result) })
		.where(eq(schema.queueJob.requestId, requestId));
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
