/**
 * D1 outbox producer for async meal nutrition recompute.
 * Queue payloads carry only jobKey wake metadata (no PII / nutrient values).
 */
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "~/db/schema";
import type { FlagshipEvaluationContext } from "~/lib/feature-flags/context.server";
import {
	type NutritionRecomputeWakeMessage,
	NutritionRecomputeWakeSchema,
} from "~/lib/schemas/nutrition";
import {
	emitNutritionQueueSendFailure,
	emitNutritionRecomputeEnqueued,
} from "~/lib/telemetry.server";
import { resolveNutritionCapabilities } from "./feature-policy.server";
import { recomputeAndStoreMealNutrition } from "./persist.server";

export const NUTRITION_RECOMPUTE_LEASE_MS = 120_000;
export const NUTRITION_RECOMPUTE_JOB_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type NutritionRecomputeTrigger =
	| "meal_write"
	| "cargo_override"
	| "org_sweep"
	| "repair";

export type ScheduleMealNutritionRecomputeResult = {
	mode: "skipped" | "sync" | "async";
	jobKey?: string;
	requestedRevision?: number;
	wakeSent?: boolean;
};

export function mealNutritionJobKey(mealId: string): string {
	return `meal:${mealId}`;
}

export function orgNutritionJobKey(organizationId: string): string {
	return `org:${organizationId}`;
}

export function buildNutritionRecomputeWake(
	jobKey: string,
	sentAt = new Date(),
): NutritionRecomputeWakeMessage {
	return NutritionRecomputeWakeSchema.parse({
		schemaVersion: 1,
		type: "nutrition.recompute.wake",
		jobKey,
		sentAt: sentAt.toISOString(),
	});
}

export type OriginatingFlagDims = {
	surface: string;
	userId?: string | null;
	clientVersion?: string | null;
	country?: string | null;
	environment?: string | null;
	plan?: string | null;
};

/**
 * Bump meal nutrition revision, mark pending, upsert outbox, optionally wake queue.
 * When async capability is off, runs synchronous recompute (tested fallback).
 */
export async function scheduleMealNutritionRecompute(
	env: Env,
	db: D1Database,
	mealId: string,
	organizationId: string,
	flagContext: FlagshipEvaluationContext,
	opts: {
		trigger: NutritionRecomputeTrigger;
		origin: OriginatingFlagDims;
		now?: Date;
	},
): Promise<ScheduleMealNutritionRecomputeResult> {
	const queueConfigured = Boolean(
		(env as { NUTRITION_RECOMPUTE_QUEUE?: Queue }).NUTRITION_RECOMPUTE_QUEUE,
	);
	const caps = await resolveNutritionCapabilities(env, flagContext, {
		queueConfigured,
	});
	if (!caps.engine) {
		return { mode: "skipped" };
	}

	const now = opts.now ?? new Date();
	const d1 = drizzle(db, { schema });
	const jobKey = mealNutritionJobKey(mealId);

	const [bumped] = await d1
		.update(schema.meal)
		.set({
			nutritionRevision: sql`${schema.meal.nutritionRevision} + 1`,
			nutritionStatus: "pending",
			// Do not touch meal.updatedAt — derived nutrition only.
		})
		.where(
			and(
				eq(schema.meal.id, mealId),
				eq(schema.meal.organizationId, organizationId),
			),
		)
		.returning({
			nutritionRevision: schema.meal.nutritionRevision,
		});

	if (!bumped) {
		return { mode: "skipped" };
	}

	const requestedRevision = bumped.nutritionRevision;

	if (!caps.asyncRecompute) {
		await recomputeAndStoreMealNutrition(
			env,
			db,
			mealId,
			organizationId,
			flagContext,
		);
		return { mode: "sync", requestedRevision };
	}

	await upsertNutritionRecomputeJob(env, {
		jobKey,
		organizationId,
		subjectType: "meal",
		subjectId: mealId,
		trigger: opts.trigger,
		requestedRevision,
		origin: opts.origin,
		now,
	});

	const wakeSent = await sendNutritionRecomputeWake(env, jobKey, now);
	emitNutritionRecomputeEnqueued(opts.trigger);
	return {
		mode: "async",
		jobKey,
		requestedRevision,
		wakeSent,
	};
}

export async function upsertNutritionRecomputeJob(
	env: Env,
	input: {
		jobKey: string;
		organizationId: string;
		subjectType: "meal" | "organization";
		subjectId: string;
		trigger: string;
		requestedRevision: number;
		origin: OriginatingFlagDims;
		now?: Date;
	},
): Promise<void> {
	const now = input.now ?? new Date();
	const expiresAt = new Date(now.getTime() + NUTRITION_RECOMPUTE_JOB_TTL_MS);
	const d1 = drizzle(env.DB, { schema });

	await d1
		.insert(schema.nutritionRecomputeJob)
		.values({
			jobKey: input.jobKey,
			organizationId: input.organizationId,
			subjectType: input.subjectType,
			subjectId: input.subjectId,
			trigger: input.trigger,
			requestedRevision: input.requestedRevision,
			processingRevision: null,
			completedRevision: 0,
			status: "pending",
			attemptCount: 0,
			dispatchAfter: now,
			lastDispatchedAt: null,
			leaseToken: null,
			leaseExpiresAt: null,
			lastErrorCode: null,
			sweepCursor: null,
			originatingSurface: input.origin.surface,
			originatingUserId: input.origin.userId ?? null,
			originatingClientVersion: input.origin.clientVersion ?? null,
			originatingCountry: input.origin.country ?? null,
			originatingEnvironment: input.origin.environment ?? null,
			originatingPlan: input.origin.plan ?? null,
			createdAt: now,
			updatedAt: now,
			completedAt: null,
			expiresAt,
		})
		.onConflictDoUpdate({
			target: schema.nutritionRecomputeJob.jobKey,
			set: {
				trigger: input.trigger,
				requestedRevision: sql`max(${schema.nutritionRecomputeJob.requestedRevision}, excluded.requested_revision)`,
				status: "pending",
				dispatchAfter: now,
				leaseToken: null,
				leaseExpiresAt: null,
				lastErrorCode: null,
				originatingSurface: input.origin.surface,
				originatingUserId: input.origin.userId ?? null,
				originatingClientVersion: input.origin.clientVersion ?? null,
				originatingCountry: input.origin.country ?? null,
				originatingEnvironment: input.origin.environment ?? null,
				originatingPlan: input.origin.plan ?? null,
				updatedAt: now,
				expiresAt,
				completedAt: null,
			},
		});
}

export async function sendNutritionRecomputeWake(
	env: Env,
	jobKey: string,
	sentAt = new Date(),
): Promise<boolean> {
	const queue = (env as { NUTRITION_RECOMPUTE_QUEUE?: Queue })
		.NUTRITION_RECOMPUTE_QUEUE;
	if (!queue) return false;
	try {
		await queue.send(buildNutritionRecomputeWake(jobKey, sentAt));
		return true;
	} catch {
		emitNutritionQueueSendFailure();
		return false;
	}
}
