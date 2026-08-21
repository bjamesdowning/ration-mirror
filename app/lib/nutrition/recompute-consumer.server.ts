/**
 * Async nutrition recompute consumer — lease + revision-safe commit.
 */
import { and, eq, gt, isNull, lt, lte, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "~/db/schema";
import {
	buildSystemFlagContext,
	type FlagshipEvaluationContext,
} from "~/lib/feature-flags/context.server";
import { isFeatureEnabled } from "~/lib/feature-flags/flags.server";
import { NutritionRecomputeWakeSchema } from "~/lib/schemas/nutrition";
import { emitNutritionRecomputeProcessed } from "~/lib/telemetry.server";
import { recomputeAndStoreMealNutrition } from "./persist.server";
import {
	NUTRITION_RECOMPUTE_LEASE_MS,
	sendNutritionRecomputeWake,
} from "./recompute-outbox.server";

export const REPAIR_BATCH_LIMIT = 25;

/** Exponential backoff for failed outbox rows the sweeper may re-wake. */
export function nutritionRecomputeRetryDelayMs(attemptCount: number): number {
	const exp = Math.min(Math.max(attemptCount, 0), 8);
	return Math.min(15 * 60_000, 30_000 * 2 ** exp);
}

export const NUTRITION_RECOMPUTE_SWEEP_PENDING_SQL = `SELECT job_key FROM nutrition_recompute_job
 WHERE status = 'pending' AND dispatch_after <= ?1 LIMIT ?2`;

export const NUTRITION_RECOMPUTE_SWEEP_LEASE_SQL = `SELECT job_key FROM nutrition_recompute_job
 WHERE status = 'processing' AND lease_expires_at < ?1 LIMIT ?2`;

export const NUTRITION_RECOMPUTE_SWEEP_FAILED_SQL = `SELECT job_key FROM nutrition_recompute_job
 WHERE status = 'failed' AND dispatch_after <= ?1 AND expires_at > ?2 LIMIT ?3`;

/**
 * Process a wake message body from NUTRITION_RECOMPUTE_QUEUE.
 */
export async function runNutritionRecomputeConsumerJob(
	env: Env,
	body: unknown,
): Promise<void> {
	const result = await consumeNutritionRecomputeWake(env, env.DB, body);
	if (result.retryable) {
		throw new Error(result.reason ?? "nutrition_recompute_retry");
	}
}

export async function consumeNutritionRecomputeWake(
	env: Env,
	db: D1Database,
	rawMessage: unknown,
): Promise<{
	processed: boolean;
	reason?: string;
	retryable?: boolean;
}> {
	const parsed = NutritionRecomputeWakeSchema.safeParse(rawMessage);
	if (!parsed.success) {
		emitNutritionRecomputeProcessed("wake", "invalid_message");
		return { processed: false, reason: "invalid_message", retryable: false };
	}

	const { jobKey } = parsed.data;
	const d1 = drizzle(db, { schema });
	const [job] = await d1
		.select()
		.from(schema.nutritionRecomputeJob)
		.where(eq(schema.nutritionRecomputeJob.jobKey, jobKey))
		.limit(1);

	if (!job) {
		emitNutritionRecomputeProcessed("wake", "missing_job");
		return { processed: false, reason: "missing_job", retryable: false };
	}

	if (
		job.status === "completed" &&
		(job.completedRevision ?? 0) >= job.requestedRevision
	) {
		emitNutritionRecomputeProcessed(job.trigger, "duplicate");
		return { processed: false, reason: "already_completed", retryable: false };
	}

	const flagContext = rebuildFlagContextFromJob(env, job);
	const enabled = await isFeatureEnabled(
		env,
		"nutrition-async-recompute",
		flagContext,
	);
	const engineOn = await isFeatureEnabled(env, "nutrition-engine", flagContext);
	if (!enabled || !engineOn) {
		// Never leave meals stuck in `pending` when the queue path is disabled.
		if (job.subjectType === "meal" && engineOn) {
			try {
				await recomputeAndStoreMealNutrition(
					env,
					db,
					job.subjectId,
					job.organizationId,
					flagContext,
					{ expectedSourceRevision: job.requestedRevision },
				);
			} catch {
				// Stale revision or transient — still complete the job below so Eat
				// is not blocked forever; a later write will re-schedule.
			}
		} else if (job.subjectType === "meal") {
			await clearMealNutritionPending(
				env,
				job.subjectId,
				job.organizationId,
				job.requestedRevision,
			);
		}
		await forceCompleteJob(env, jobKey, job.requestedRevision);
		emitNutritionRecomputeProcessed(job.trigger, "flag_off");
		return { processed: false, reason: "flag_off", retryable: false };
	}

	const claim = await claimNutritionRecomputeJob(
		env,
		jobKey,
		job.requestedRevision,
	);
	if (!claim.claimed) {
		emitNutritionRecomputeProcessed(job.trigger, "claim_miss");
		return { processed: false, reason: claim.reason, retryable: false };
	}

	if (job.subjectType !== "meal") {
		await markJobFailed(
			env,
			jobKey,
			claim.leaseToken,
			"unsupported_subject",
			job.attemptCount + 1,
		);
		emitNutritionRecomputeProcessed(job.trigger, "skipped");
		return {
			processed: false,
			reason: "unsupported_subject",
			retryable: false,
		};
	}

	try {
		const snapshot = await recomputeAndStoreMealNutrition(
			env,
			db,
			job.subjectId,
			job.organizationId,
			flagContext,
			{
				expectedSourceRevision: claim.processingRevision,
				leaseToken: claim.leaseToken,
				jobKey,
			},
		);

		if (!snapshot) {
			const d1 = drizzle(db, { schema });
			const [mealStillThere] = await d1
				.select({ id: schema.meal.id })
				.from(schema.meal)
				.where(
					and(
						eq(schema.meal.id, job.subjectId),
						eq(schema.meal.organizationId, job.organizationId),
					),
				)
				.limit(1);
			if (!mealStillThere) {
				// Subject deleted — safe to ack.
				await markJobCompleted(
					env,
					jobKey,
					claim.leaseToken,
					claim.processingRevision,
				);
				emitNutritionRecomputeProcessed(job.trigger, "skipped");
				return { processed: false, reason: "subject_gone", retryable: false };
			}
			// Engine off or unresolved — leave pending for repair, do not fake-complete.
			await releaseJobToPending(env, jobKey, claim.leaseToken);
			emitNutritionRecomputeProcessed(job.trigger, "skipped");
			return { processed: false, reason: "no_snapshot", retryable: false };
		}

		await markJobCompleted(
			env,
			jobKey,
			claim.leaseToken,
			claim.processingRevision,
		);
		emitNutritionRecomputeProcessed(job.trigger, "ok");
		return { processed: true };
	} catch (err) {
		const code =
			err instanceof Error && err.message === "stale_revision"
				? "stale_revision"
				: "transient_error";
		if (code === "stale_revision") {
			await releaseJobToPending(env, jobKey, claim.leaseToken);
			await sendNutritionRecomputeWake(env, jobKey);
			emitNutritionRecomputeProcessed(job.trigger, "stale");
			return { processed: false, reason: code, retryable: false };
		}
		await markJobFailed(
			env,
			jobKey,
			claim.leaseToken,
			code,
			job.attemptCount + 1,
		);
		emitNutritionRecomputeProcessed(job.trigger, "failed");
		return { processed: false, reason: code, retryable: true };
	}
}

export async function claimNutritionRecomputeJob(
	env: Env,
	jobKey: string,
	requestedRevision: number,
	now = new Date(),
): Promise<
	| {
			claimed: true;
			leaseToken: string;
			processingRevision: number;
	  }
	| { claimed: false; reason: string }
> {
	const leaseToken = crypto.randomUUID();
	const leaseExpiresAt = new Date(now.getTime() + NUTRITION_RECOMPUTE_LEASE_MS);
	const d1 = drizzle(env.DB, { schema });

	const updated = await d1
		.update(schema.nutritionRecomputeJob)
		.set({
			status: "processing",
			processingRevision: requestedRevision,
			leaseToken,
			leaseExpiresAt,
			attemptCount: sql`${schema.nutritionRecomputeJob.attemptCount} + 1`,
			lastDispatchedAt: now,
			updatedAt: now,
		})
		.where(
			and(
				eq(schema.nutritionRecomputeJob.jobKey, jobKey),
				eq(schema.nutritionRecomputeJob.requestedRevision, requestedRevision),
				or(
					eq(schema.nutritionRecomputeJob.status, "pending"),
					and(
						eq(schema.nutritionRecomputeJob.status, "processing"),
						or(
							isNull(schema.nutritionRecomputeJob.leaseExpiresAt),
							lte(schema.nutritionRecomputeJob.leaseExpiresAt, now),
						),
					),
					eq(schema.nutritionRecomputeJob.status, "failed"),
				),
			),
		)
		.returning({ jobKey: schema.nutritionRecomputeJob.jobKey });

	if (updated.length === 0) {
		return { claimed: false, reason: "claim_conflict" };
	}
	return { claimed: true, leaseToken, processingRevision: requestedRevision };
}

/** Complete a job without a lease (flag-off / kill-switch path). */
async function forceCompleteJob(
	env: Env,
	jobKey: string,
	completedRevision: number,
	now = new Date(),
): Promise<void> {
	const d1 = drizzle(env.DB, { schema });
	await d1
		.update(schema.nutritionRecomputeJob)
		.set({
			status: "completed",
			completedRevision,
			leaseToken: null,
			leaseExpiresAt: null,
			completedAt: now,
			updatedAt: now,
			lastErrorCode: "flag_off",
		})
		.where(eq(schema.nutritionRecomputeJob.jobKey, jobKey));
}

/**
 * When nutrition-engine is off, clear `pending` so private Eat is not blocked
 * indefinitely. Prefer keeping an existing snapshot as `current`.
 */
async function clearMealNutritionPending(
	env: Env,
	mealId: string,
	organizationId: string,
	expectedRevision: number,
	now = new Date(),
): Promise<void> {
	const d1 = drizzle(env.DB, { schema });
	await d1
		.update(schema.meal)
		.set({
			nutritionStatus: "current",
			nutritionUpdatedAt: now,
		})
		.where(
			and(
				eq(schema.meal.id, mealId),
				eq(schema.meal.organizationId, organizationId),
				eq(schema.meal.nutritionRevision, expectedRevision),
				eq(schema.meal.nutritionStatus, "pending"),
			),
		);
}

async function markJobCompleted(
	env: Env,
	jobKey: string,
	leaseToken: string,
	completedRevision: number,
	now = new Date(),
): Promise<void> {
	const d1 = drizzle(env.DB, { schema });
	await d1
		.update(schema.nutritionRecomputeJob)
		.set({
			status: "completed",
			completedRevision,
			leaseToken: null,
			leaseExpiresAt: null,
			completedAt: now,
			updatedAt: now,
			lastErrorCode: null,
		})
		.where(
			and(
				eq(schema.nutritionRecomputeJob.jobKey, jobKey),
				eq(schema.nutritionRecomputeJob.leaseToken, leaseToken),
			),
		);
}

export async function markJobFailed(
	env: Env,
	jobKey: string,
	leaseToken: string,
	errorCode: string,
	attemptCount: number,
	now = new Date(),
): Promise<void> {
	const d1 = drizzle(env.DB, { schema });
	const dispatchAfter = new Date(
		now.getTime() + nutritionRecomputeRetryDelayMs(attemptCount),
	);
	await d1
		.update(schema.nutritionRecomputeJob)
		.set({
			status: "failed",
			lastErrorCode: errorCode,
			leaseToken: null,
			leaseExpiresAt: null,
			dispatchAfter,
			updatedAt: now,
		})
		.where(
			and(
				eq(schema.nutritionRecomputeJob.jobKey, jobKey),
				eq(schema.nutritionRecomputeJob.leaseToken, leaseToken),
			),
		);
}

async function releaseJobToPending(
	env: Env,
	jobKey: string,
	leaseToken: string,
	now = new Date(),
): Promise<void> {
	const d1 = drizzle(env.DB, { schema });
	await d1
		.update(schema.nutritionRecomputeJob)
		.set({
			status: "pending",
			leaseToken: null,
			leaseExpiresAt: null,
			dispatchAfter: now,
			updatedAt: now,
		})
		.where(
			and(
				eq(schema.nutritionRecomputeJob.jobKey, jobKey),
				eq(schema.nutritionRecomputeJob.leaseToken, leaseToken),
			),
		);
}

function rebuildFlagContextFromJob(
	env: Env,
	job: typeof schema.nutritionRecomputeJob.$inferSelect,
): FlagshipEvaluationContext {
	const surface = (job.originatingSurface || "system") as
		| "web"
		| "ios"
		| "mcp"
		| "copilot"
		| "system";
	const base = buildSystemFlagContext(env, job.originatingUserId, {
		originatingSurface: surface,
		originatingClientVersion: job.originatingClientVersion,
	});
	return {
		...base,
		country: job.originatingCountry ?? base.country,
		plan: job.originatingPlan ?? base.plan,
	};
}

/**
 * Redispatch due pending jobs and recover expired leases (bounded).
 * Safe to call from cron; does not fail user mutations.
 */
export async function repairDueNutritionRecomputeJobs(
	env: Env,
	now = new Date(),
): Promise<number> {
	const d1 = drizzle(env.DB, { schema });
	const job = schema.nutritionRecomputeJob;

	const pending = await d1
		.select({ jobKey: job.jobKey })
		.from(job)
		.where(and(eq(job.status, "pending"), lte(job.dispatchAfter, now)))
		.limit(REPAIR_BATCH_LIMIT);
	const processing = await d1
		.select({ jobKey: job.jobKey })
		.from(job)
		.where(and(eq(job.status, "processing"), lt(job.leaseExpiresAt, now)))
		.limit(REPAIR_BATCH_LIMIT);
	const failed = await d1
		.select({ jobKey: job.jobKey })
		.from(job)
		.where(
			and(
				eq(job.status, "failed"),
				lte(job.dispatchAfter, now),
				gt(job.expiresAt, now),
			),
		)
		.limit(REPAIR_BATCH_LIMIT);

	const dueKeys = [
		...new Set([...pending, ...processing, ...failed].map((row) => row.jobKey)),
	].slice(0, REPAIR_BATCH_LIMIT);

	if (dueKeys.length === 0) return 0;

	const reset = {
		status: "pending" as const,
		leaseToken: null,
		leaseExpiresAt: null,
		dispatchAfter: now,
		updatedAt: now,
	};
	const stmts = dueKeys.map((jobKey) =>
		d1.update(job).set(reset).where(eq(job.jobKey, jobKey)),
	);
	// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types are complex
	await d1.batch(stmts as [any, ...any[]]);

	let sent = 0;
	for (const jobKey of dueKeys) {
		if (await sendNutritionRecomputeWake(env, jobKey, now)) {
			sent += 1;
		}
	}
	return sent;
}

/** @deprecated Prefer {@link consumeNutritionRecomputeWake}. */
export async function consumeNutritionRecomputeJob(
	env: Env,
	db: D1Database,
	rawMessage: unknown,
	flagContext: FlagshipEvaluationContext,
): Promise<{ processed: boolean; reason?: string }> {
	void flagContext;
	const result = await consumeNutritionRecomputeWake(env, db, rawMessage);
	return { processed: result.processed, reason: result.reason };
}
