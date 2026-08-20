/**
 * Account/group purge tombstones and durable job records in KV.
 * Blocks re-auth while background purge runs; enables cron retry on failure.
 */

import { log, redactId } from "~/lib/logging.server";

const USER_PENDING_PREFIX = "purge:pending:user:";
const JOB_PREFIX = "purge:job:";
/** Keep pending denylist aligned with durable job TTL so tombstones outlive retries. */
const PENDING_TTL_SEC = 60 * 60 * 24 * 14;
const JOB_TTL_SEC = 60 * 60 * 24 * 14;
/** Soft ceiling for cron retries before escalated alerting (pending stays until wipe succeeds). */
export const PURGE_JOB_MAX_ATTEMPTS = 20;

export type PurgeJobKind = "account" | "group";

export type PurgeJobRecord = {
	id: string;
	kind: PurgeJobKind;
	status: "pending" | "failed";
	userId?: string;
	email?: string;
	stripeCustomerId?: string | null;
	organizationId?: string;
	errorMessage?: string;
	attemptCount: number;
	createdAt: string;
	updatedAt: string;
};

export function userPurgePendingKey(userId: string): string {
	return `${USER_PENDING_PREFIX}${userId}`;
}

export function purgeJobKey(jobId: string): string {
	return `${JOB_PREFIX}${jobId}`;
}

export async function markUserPurgePending(
	kv: KVNamespace,
	userId: string,
): Promise<void> {
	await kv.put(userPurgePendingKey(userId), "1", {
		expirationTtl: PENDING_TTL_SEC,
	});
}

export async function clearUserPurgePending(
	kv: KVNamespace,
	userId: string,
): Promise<void> {
	await kv.delete(userPurgePendingKey(userId));
}

export async function isUserPurgePending(
	kv: KVNamespace,
	userId: string,
): Promise<boolean> {
	const value = await kv.get(userPurgePendingKey(userId));
	return value === "1";
}

export async function putPurgeJob(
	kv: KVNamespace,
	job: Omit<
		PurgeJobRecord,
		"createdAt" | "updatedAt" | "status" | "attemptCount"
	> & {
		status?: PurgeJobRecord["status"];
		attemptCount?: number;
	},
): Promise<PurgeJobRecord> {
	const now = new Date().toISOString();
	const record: PurgeJobRecord = {
		...job,
		status: job.status ?? "pending",
		attemptCount: job.attemptCount ?? 0,
		createdAt: now,
		updatedAt: now,
	};
	await kv.put(purgeJobKey(record.id), JSON.stringify(record), {
		expirationTtl: JOB_TTL_SEC,
	});
	return record;
}

export async function markPurgeJobFailed(
	kv: KVNamespace,
	jobId: string,
	errorMessage: string,
): Promise<PurgeJobRecord | null> {
	const raw = await kv.get(purgeJobKey(jobId));
	if (!raw) {
		log.warn("[Purge] markPurgeJobFailed missing job", {
			jobId: redactId(jobId),
		});
		return null;
	}
	const existing = JSON.parse(raw) as PurgeJobRecord;
	const updated: PurgeJobRecord = {
		...existing,
		status: "failed",
		errorMessage,
		attemptCount: (existing.attemptCount ?? 0) + 1,
		updatedAt: new Date().toISOString(),
	};
	await kv.put(purgeJobKey(jobId), JSON.stringify(updated), {
		expirationTtl: JOB_TTL_SEC,
	});
	return updated;
}

export async function clearPurgeJob(
	kv: KVNamespace,
	jobId: string,
): Promise<void> {
	await kv.delete(purgeJobKey(jobId));
}

export async function getPurgeJob(
	kv: KVNamespace,
	jobId: string,
): Promise<PurgeJobRecord | null> {
	const raw = await kv.get(purgeJobKey(jobId));
	if (!raw) return null;
	try {
		return JSON.parse(raw) as PurgeJobRecord;
	} catch {
		return null;
	}
}

export function matchesPurgeRetryConfirmation(
	job: PurgeJobRecord,
	confirmValue: string,
): boolean {
	const trimmed = confirmValue.trim();
	if (!trimmed) return false;
	if (job.kind === "account") {
		const email = job.email;
		return (
			typeof email === "string" && email.toLowerCase() === trimmed.toLowerCase()
		);
	}
	return Boolean(job.organizationId) && job.organizationId === trimmed;
}

export type AdminFailedPurgeJobView = {
	id: string;
	kind: PurgeJobKind;
	redactedId: string;
	email: string | null;
	organizationId: string | null;
	attemptCount: number;
	errorMessage: string | null;
	updatedAt: string;
};

export function toAdminFailedPurgeJobView(
	job: PurgeJobRecord,
): AdminFailedPurgeJobView {
	const rawId =
		job.kind === "account"
			? (job.userId ?? job.id)
			: (job.organizationId ?? job.id);
	return {
		id: job.id,
		kind: job.kind,
		redactedId: redactId(rawId),
		email: job.email ?? null,
		organizationId: job.kind === "group" ? (job.organizationId ?? null) : null,
		attemptCount: job.attemptCount,
		errorMessage: job.errorMessage ?? null,
		updatedAt: job.updatedAt,
	};
}

export async function listFailedPurgeJobs(
	kv: KVNamespace,
	limit = 50,
): Promise<PurgeJobRecord[]> {
	const listed = await kv.list({ prefix: JOB_PREFIX, limit });
	const jobs: PurgeJobRecord[] = [];
	for (const key of listed.keys) {
		const raw = await kv.get(key.name);
		if (!raw) continue;
		try {
			const job = JSON.parse(raw) as PurgeJobRecord;
			if (job.status === "failed") jobs.push(job);
		} catch {
			// skip corrupt
		}
	}
	return jobs;
}
