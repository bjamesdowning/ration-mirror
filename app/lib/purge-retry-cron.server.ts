/**
 * Retry failed account/group purge jobs stored in KV.
 */

import { retryOnD1Contention } from "~/lib/error-handler";
import { log, redactId } from "~/lib/logging.server";
import { deleteOrganization } from "~/lib/organizations.server";
import { notifyPurgeFailure } from "~/lib/purge-failure-notify.server";
import {
	clearPurgeJob,
	clearUserPurgePending,
	listFailedPurgeJobs,
	markPurgeJobFailed,
	type PurgeJobRecord,
} from "~/lib/purge-pending.server";
import { purgeUserAccount } from "~/lib/user-purge.server";

export async function retryFailedPurgeJobs(env: Cloudflare.Env): Promise<void> {
	const failed = await listFailedPurgeJobs(env.RATION_KV, 25);
	if (failed.length === 0) return;

	log.info("[CRON] Retrying failed purge jobs", { count: failed.length });

	for (const job of failed) {
		try {
			await retryOnePurgeJob(env, job);
			await clearPurgeJob(env.RATION_KV, job.id);
			if (job.kind === "account" && job.userId) {
				await clearUserPurgePending(env.RATION_KV, job.userId);
			}
			log.info("[CRON] Purge job retry succeeded", {
				jobId: redactId(job.id),
				kind: job.kind,
			});
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			await markPurgeJobFailed(env.RATION_KV, job.id, errorMessage);
			await notifyPurgeFailure(env, {
				kind: job.kind,
				resourceId: job.id,
				errorMessage: `cron retry failed: ${errorMessage}`,
			});
		}
	}
}

async function retryOnePurgeJob(
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
