/**
 * Retry failed account/group purge jobs stored in KV.
 */

import { flattenErrorText, retryOnD1Contention } from "~/lib/error-handler";
import { log, redactId } from "~/lib/logging.server";
import { deleteOrganization } from "~/lib/organizations.server";
import { notifyPurgeFailure } from "~/lib/purge-failure-notify.server";
import {
	clearPurgeJob,
	clearUserPurgePending,
	listFailedPurgeJobs,
	markPurgeJobFailed,
	markUserPurgePending,
	PURGE_JOB_MAX_ATTEMPTS,
	type PurgeJobRecord,
} from "~/lib/purge-pending.server";
import { purgeUserAccount } from "~/lib/user-purge.server";

export type PurgeRetrySource = "cron" | "admin";

export async function retryFailedPurgeJobs(env: Cloudflare.Env): Promise<void> {
	const failed = await listFailedPurgeJobs(env.RATION_KV, 25);
	if (failed.length === 0) return;

	log.info("[CRON] Retrying failed purge jobs", { count: failed.length });

	for (const job of failed) {
		await attemptPurgeJobRetry(env, job, "cron");
	}
}

export async function attemptPurgeJobRetry(
	env: Cloudflare.Env,
	job: PurgeJobRecord,
	source: PurgeRetrySource,
): Promise<{ ok: boolean }> {
	try {
		await retryOnePurgeJob(env, job);
		await clearPurgeJob(env.RATION_KV, job.id);
		if (job.kind === "account" && job.userId) {
			await clearUserPurgePending(env.RATION_KV, job.userId);
		}
		log.info("[Purge] Purge job retry succeeded", {
			jobId: redactId(job.id),
			kind: job.kind,
			source,
		});
		return { ok: true };
	} catch (error) {
		const errorMessage = flattenErrorText(error);
		const updated = await markPurgeJobFailed(
			env.RATION_KV,
			job.id,
			errorMessage,
		);
		if (job.kind === "account" && job.userId) {
			// Refresh tombstone TTL so pending cannot expire while retries continue.
			await markUserPurgePending(env.RATION_KV, job.userId);
		}
		const attempts = updated?.attemptCount ?? (job.attemptCount ?? 0) + 1;
		const escalated = attempts >= PURGE_JOB_MAX_ATTEMPTS;
		const prefix = source === "admin" ? "admin retry" : "cron retry";
		await notifyPurgeFailure(env, {
			kind: job.kind,
			resourceId: job.id,
			errorMessage: escalated
				? `${prefix} exhausted (${attempts} attempts): ${errorMessage}`
				: `${prefix} failed: ${errorMessage}`,
		});
		log.error("[Purge] Purge job retry failed", {
			jobId: redactId(job.id),
			kind: job.kind,
			source,
			attempts,
			errorMessage,
		});
		// Never clear purge-pending on failure — Apple/GDPR require wipe to finish.
		return { ok: false };
	}
}

export async function retryOnePurgeJob(
	env: Cloudflare.Env,
	job: PurgeJobRecord,
): Promise<void> {
	if (job.kind === "account") {
		const userId = job.userId;
		const email = job.email;
		if (!userId || !email) {
			throw new Error("Account purge job missing userId/email");
		}
		await retryOnD1Contention(() =>
			purgeUserAccount(
				env,
				{ userId, email },
				{
					stripeCustomerId: job.stripeCustomerId,
					stripeBestEffort: true,
				},
			),
		);
		return;
	}

	const organizationId = job.organizationId;
	if (!organizationId) {
		throw new Error("Group purge job missing organizationId");
	}
	await retryOnD1Contention(() =>
		deleteOrganization(env, organizationId, {
			skipAccessRevocation: true,
		}),
	);
}
