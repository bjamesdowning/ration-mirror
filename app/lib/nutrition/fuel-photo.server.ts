import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "~/db/schema";
import { requireAIConsent } from "~/lib/ai-consent.server";
import type { FlagshipEvaluationContext } from "~/lib/feature-flags/context.server";
import {
	AI_COSTS,
	checkBalance,
	deductCredits,
	failAiJobWithRefund,
	InsufficientCreditsError,
} from "~/lib/ledger.server";
import {
	claimQueueJobForProcessing,
	type getQueueJob,
	runIdempotentAiJob,
	updateQueueJobResult,
} from "~/lib/queue-job.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import type { DiaryFoodWrite } from "~/lib/schemas/diary";
import {
	FUEL_PHOTO_MAX_BYTES,
	FuelPhotoContentTypeSchema,
} from "~/lib/schemas/fuel";
import { UuidSchema } from "~/lib/schemas/uuid";
import { parseAiNutritionJson } from "./ai-estimate.server";
import { assertActiveNutritionConsent } from "./consent.server";
import { DiaryFoodNotFoundError, logDiaryFood } from "./diary.server";
import {
	assertNutritionFuelPage,
	assertNutritionPhotoLog,
} from "./fast-log-flag.server";
import { assertFuelCreateRoom } from "./fuel-cap.server";
import { FuelPhotoTooLargeError, FuelPhotoTypeError } from "./fuel-errors";
import { fuelPhotoClientStatus } from "./fuel-photo-status";
import type { FoodLogLine } from "./propose-food-log.server";
import type {
	NutritionFlagContext,
	NutritionPrincipal,
} from "./service.server";

const FUEL_PHOTO_REASON = "Fuel photo";
const JOB_TTL_MS = 60 * 60 * 1000;

type JobStatus = "pending" | "processing" | "completed" | "failed";

type JobRow = {
	requestId: string;
	userId: string | null;
	organizationId: string;
	status: JobStatus;
	resultJson: string | null;
	modelArtifact: string | null;
	expiresAt: Date;
};

type FuelJobMeta = {
	cost: number;
	imageKey: string;
	mimeType: "image/jpeg" | "image/png" | "image/webp";
	operationId: string;
	draftId?: string;
	readyAt?: string;
};

export type FuelPhotoDeps = {
	now?: Date;
	analyze?: (
		env: Env,
		principal: NutritionPrincipal,
		bytes: ArrayBuffer,
		mimeType: FuelJobMeta["mimeType"],
		requestId: string,
	) => Promise<FoodLogLine[]>;
	debit?: typeof deductCredits;
	refund?: typeof failAiJobWithRefund;
	logIntake?: typeof logDiaryFood;
};

function parseMeta(raw: string | null): FuelJobMeta | null {
	if (!raw) return null;
	try {
		const value = JSON.parse(raw) as Partial<FuelJobMeta>;
		const mime = FuelPhotoContentTypeSchema.safeParse(value.mimeType);
		if (
			typeof value.imageKey !== "string" ||
			typeof value.operationId !== "string" ||
			!mime.success
		) {
			return null;
		}
		return {
			cost: typeof value.cost === "number" ? value.cost : AI_COSTS.SCAN,
			imageKey: value.imageKey,
			mimeType: mime.data,
			operationId: value.operationId,
			draftId: typeof value.draftId === "string" ? value.draftId : undefined,
			readyAt: typeof value.readyAt === "string" ? value.readyAt : undefined,
		};
	} catch {
		return null;
	}
}

async function loadJob(
	db: D1Database,
	requestId: string,
): Promise<JobRow | null> {
	const d1 = drizzle(db, { schema });
	const [row] = await d1
		.select({
			requestId: schema.queueJob.requestId,
			userId: schema.queueJob.userId,
			organizationId: schema.queueJob.organizationId,
			status: schema.queueJob.status,
			resultJson: schema.queueJob.resultJson,
			modelArtifact: schema.queueJob.modelArtifact,
			expiresAt: schema.queueJob.expiresAt,
		})
		.from(schema.queueJob)
		.where(eq(schema.queueJob.requestId, requestId))
		.limit(1);
	if (!row) return null;
	return {
		...row,
		status: row.status as JobStatus,
		userId: row.userId ?? null,
	};
}

function bytesToBase64(bytes: ArrayBuffer): string {
	const view = new Uint8Array(bytes);
	let binary = "";
	const chunk = 0x8000;
	for (let index = 0; index < view.length; index += chunk) {
		binary += String.fromCharCode(...view.subarray(index, index + chunk));
	}
	return btoa(binary);
}

export async function analyzeFuelPhoto(
	env: Env,
	principal: NutritionPrincipal,
	bytes: ArrayBuffer,
	mimeType: FuelJobMeta["mimeType"],
	requestId: string,
): Promise<FoodLogLine[]> {
	const { callGeminiWithArtifact } = await import("~/lib/queue-job.server");
	const result = await callGeminiWithArtifact(env, requestId, {
		feature: "import_photo",
		parts: [
			{
				text: 'Identify each food in this photo. Return ONLY JSON {"lines":[{"name":"","energyKcal":0,"proteinG":0,"carbsG":0,"fatG":0,"fiberG":null}]}. Estimates are unverified. Do not include an email address.',
			},
			{ inlineData: { mimeType, data: bytesToBase64(bytes) } },
		],
		metadata: {
			organizationId: principal.organizationId,
			userId: principal.userId,
		},
	});
	if (!result.ok || !result.text) throw new Error("fuel_photo_model");
	const parsed = parseAiNutritionJson(result.text) as {
		lines?: Array<Record<string, unknown>>;
	} | null;
	const lines = parsed?.lines ?? [];
	if (lines.length === 0) throw new Error("fuel_photo_model");
	return lines.map((line) => ({
		name: String(line.name ?? "Food"),
		energyKcal: Number(line.energyKcal ?? 0),
		proteinG: Number(line.proteinG ?? 0),
		carbsG: Number(line.carbsG ?? 0),
		fatG: Number(line.fatG ?? 0),
		fiberG:
			line.fiberG == null || !Number.isFinite(Number(line.fiberG))
				? null
				: Number(line.fiberG),
		amount: 1,
		unit: "serving",
		barcode: null,
		fdcId: null,
		compositionSource: "ai_estimate",
	}));
}

/** One confirm writes one intake, however many foods the draft lists. */
export function photoConfirmSlotCount(lineCount: number): 1 {
	void lineCount;
	return 1;
}

async function refundFuelJob(
	env: Env,
	job: JobRow,
	meta: FuelJobMeta,
	deps: FuelPhotoDeps,
): Promise<void> {
	const fresh = await loadJob(env.DB, job.requestId);
	const stored = parseMeta(fresh?.resultJson ?? job.resultJson);
	const refund = deps.refund ?? failAiJobWithRefund;
	await refund(env, {
		requestId: job.requestId,
		organizationId: job.organizationId,
		userId: job.userId ?? "",
		cost: stored?.cost ?? meta.cost,
		reason: FUEL_PHOTO_REASON,
		writeStatus: async () =>
			updateQueueJobResult(env.DB, job.requestId, "failed", {
				cost: stored?.cost ?? meta.cost,
			}),
	});
	await env.STORAGE.delete(meta.imageKey);
	const db = drizzle(env.DB, { schema });
	await db
		.update(schema.nutritionOperation)
		.set({ status: "failed" })
		.where(
			and(
				eq(schema.nutritionOperation.id, meta.operationId),
				eq(schema.nutritionOperation.status, "in_progress"),
			),
		);
}

export async function submitFuelPhoto(
	env: Env,
	principal: NutritionPrincipal,
	flags: NutritionFlagContext & FlagshipEvaluationContext,
	input: {
		operationKey: string;
		bytes: ArrayBuffer;
		contentType: string;
		now?: Date;
	},
	deps: FuelPhotoDeps = {},
): Promise<{ requestId: string; status: "queued"; replayed: boolean }> {
	if (!UuidSchema.safeParse(input.operationKey).success) {
		throw Object.assign(new Error("Invalid request"), {
			code: "invalid_request",
			status: 400,
		});
	}
	const contentType = FuelPhotoContentTypeSchema.safeParse(input.contentType);
	if (!contentType.success) throw new FuelPhotoTypeError();
	if (input.bytes.byteLength > FUEL_PHOTO_MAX_BYTES)
		throw new FuelPhotoTooLargeError();

	await assertNutritionFuelPage(env, flags);
	await assertNutritionPhotoLog(env, flags);
	if (principal.surface === "mcp" || principal.surface === "copilot") {
		await assertActiveNutritionConsent(
			env.DB,
			principal.userId,
			"agent_processing",
		);
	}
	await assertActiveNutritionConsent(env.DB, principal.userId, "intake");
	await requireAIConsent(env.DB, principal.userId);

	const now = input.now ?? deps.now ?? new Date();
	const db = drizzle(env.DB, { schema });
	const [existing] = await db
		.select()
		.from(schema.nutritionOperation)
		.where(
			and(
				eq(schema.nutritionOperation.userId, principal.userId),
				eq(schema.nutritionOperation.operationKey, input.operationKey),
			),
		)
		.limit(1);
	const replayId = existing?.resultJson?.requestId;
	if (existing && existing.status !== "failed" && replayId) {
		return { requestId: replayId, status: "queued", replayed: true };
	}
	if (existing) {
		throw Object.assign(new Error("Operation conflict"), {
			code: "nutrition_write_conflict",
			status: 409,
		});
	}

	const rate = await checkRateLimit(env.RATION_KV, "scan", principal.userId);
	if (!rate.allowed) throw rateLimitResponse(rate);
	await assertFuelCreateRoom(env.DB, principal.userId, now, now);
	const balance = await checkBalance(env, principal.organizationId);
	if (balance < AI_COSTS.SCAN) {
		throw new InsufficientCreditsError(AI_COSTS.SCAN, balance);
	}

	const requestId = crypto.randomUUID();
	const imageKey = `fuel-photo/${principal.userId}/${requestId}`;
	const operationId = crypto.randomUUID();
	const meta: FuelJobMeta = {
		cost: AI_COSTS.SCAN,
		imageKey,
		mimeType: contentType.data,
		operationId,
	};
	await env.STORAGE.put(imageKey, input.bytes, {
		httpMetadata: { contentType: contentType.data },
	});
	let debited = false;
	try {
		await db.insert(schema.nutritionOperation).values({
			id: operationId,
			userId: principal.userId,
			organizationId: principal.organizationId,
			operationKey: input.operationKey,
			requestHash: requestId,
			operationType: "fuel_photo",
			status: "in_progress",
			itemCount: 1,
			resultJson: { requestId },
			createdAt: now,
		});
		await db.insert(schema.queueJob).values({
			requestId,
			jobType: "fuel_photo",
			organizationId: principal.organizationId,
			userId: principal.userId,
			status: "pending",
			resultJson: JSON.stringify(meta),
			expiresAt: new Date(now.getTime() + JOB_TTL_MS),
		});
		await (deps.debit ?? deductCredits)(
			env,
			principal.organizationId,
			principal.userId,
			AI_COSTS.SCAN,
			FUEL_PHOTO_REASON,
		);
		debited = true;
		if (!env.FUEL_PHOTO_QUEUE) throw new Error("fuel_photo_queue_missing");
		await env.FUEL_PHOTO_QUEUE.send({ requestId });
		return { requestId, status: "queued", replayed: false };
	} catch (error) {
		if (debited) {
			const row = await loadJob(env.DB, requestId);
			await refundFuelJob(
				env,
				row ?? {
					requestId,
					userId: principal.userId,
					organizationId: principal.organizationId,
					status: "pending",
					resultJson: JSON.stringify(meta),
					modelArtifact: null,
					expiresAt: new Date(now.getTime() + JOB_TTL_MS),
				},
				meta,
				deps,
			);
		} else {
			await env.STORAGE.delete(imageKey);
			await db
				.update(schema.nutritionOperation)
				.set({ status: "failed" })
				.where(eq(schema.nutritionOperation.id, operationId));
		}
		throw error;
	}
}

export async function readFuelPhoto(
	env: Env,
	userId: string,
	requestId: string,
	now = new Date(),
) {
	const job = await loadJob(env.DB, requestId);
	if (!job || job.userId !== userId) throw new DiaryFoodNotFoundError();
	const meta = parseMeta(job.resultJson);
	if (!meta) throw new DiaryFoodNotFoundError();
	const status = fuelPhotoClientStatus({
		queueStatus: job.status,
		expiresAt: job.expiresAt,
		now,
		readyAt: meta.readyAt ? new Date(meta.readyAt) : null,
	});
	if (status !== "ready_to_review" || !meta.draftId) {
		return {
			requestId,
			status,
			draftId: null,
			lines: null as FoodLogLine[] | null,
		};
	}
	const db = drizzle(env.DB, { schema });
	const [draft] = await db
		.select()
		.from(schema.nutritionFoodDraft)
		.where(
			and(
				eq(schema.nutritionFoodDraft.id, meta.draftId),
				eq(schema.nutritionFoodDraft.userId, userId),
			),
		)
		.limit(1);
	const lines = Array.isArray(draft?.linesJson)
		? (draft.linesJson as FoodLogLine[])
		: null;
	return { requestId, status, draftId: draft?.id ?? null, lines };
}

export async function confirmFuelPhoto(
	env: Env,
	principal: NutritionPrincipal,
	flags: NutritionFlagContext & FlagshipEvaluationContext,
	requestId: string,
	input: DiaryFoodWrite & { now?: Date },
	deps: FuelPhotoDeps = {},
) {
	await assertNutritionFuelPage(env, flags);
	const job = await loadJob(env.DB, requestId);
	if (!job || job.userId !== principal.userId)
		throw new DiaryFoodNotFoundError();
	const meta = parseMeta(job.resultJson);
	if (!meta?.draftId) throw new DiaryFoodNotFoundError();
	const now = input.now ?? deps.now ?? new Date();
	const status = fuelPhotoClientStatus({
		queueStatus: job.status,
		expiresAt: job.expiresAt,
		now,
		readyAt: meta.readyAt ? new Date(meta.readyAt) : null,
	});
	if (status !== "ready_to_review") throw new DiaryFoodNotFoundError();
	const occurredAt = input.occurredAt ? new Date(input.occurredAt) : now;
	await assertFuelCreateRoom(env.DB, principal.userId, occurredAt, now);
	return (deps.logIntake ?? logDiaryFood)(env, principal, flags, input);
}

export async function runFuelPhotoConsumerJob(
	env: Env,
	body: unknown,
	deps: FuelPhotoDeps = {},
): Promise<void> {
	const requestId =
		body && typeof body === "object" && "requestId" in body
			? (body as { requestId?: unknown }).requestId
			: null;
	if (typeof requestId !== "string" || requestId.length === 0) return;
	const job = await loadJob(env.DB, requestId);
	if (!job) throw new Error("fuel_photo_job_missing");
	if (!job.userId) return;
	if (job.status === "completed" || job.status === "failed") return;
	const meta = parseMeta(job.resultJson);
	if (!meta) return;
	const now = deps.now ?? new Date();
	if (now.getTime() >= job.expiresAt.getTime()) {
		await refundFuelJob(env, job, meta, deps);
		return;
	}
	const principal: NutritionPrincipal = {
		userId: job.userId,
		organizationId: job.organizationId,
		surface: "web",
		authMethod: "session",
	};
	await runIdempotentAiJob(
		env.DB,
		requestId,
		async () => {
			let draftStored = false;
			try {
				const db = drizzle(env.DB, { schema });
				const [operation] = await db
					.select()
					.from(schema.nutritionOperation)
					.where(eq(schema.nutritionOperation.id, meta.operationId))
					.limit(1);
				const existingDraft = operation?.resultJson?.draftId;
				if (operation?.status === "completed" && existingDraft) {
					await updateQueueJobResult(env.DB, requestId, "completed", {
						...meta,
						draftId: existingDraft,
						readyAt: now.toISOString(),
					});
					await env.STORAGE.delete(meta.imageKey);
					return;
				}
				const object = await env.STORAGE.get(meta.imageKey);
				if (!object) throw new Error("fuel_photo_missing");
				const lines = await (deps.analyze ?? analyzeFuelPhoto)(
					env,
					principal,
					await object.arrayBuffer(),
					meta.mimeType,
					requestId,
				);
				const draftId = crypto.randomUUID();
				await db.insert(schema.nutritionFoodDraft).values({
					id: draftId,
					userId: job.userId as string,
					organizationId: job.organizationId,
					operationId: meta.operationId,
					subject: "custom",
					linesJson: lines,
					credits: meta.cost,
					createdAt: now,
				});
				await db
					.update(schema.nutritionOperation)
					.set({
						status: "completed",
						completedAt: now,
						resultJson: { draftId, requestId },
					})
					.where(eq(schema.nutritionOperation.id, meta.operationId));
				draftStored = true;
				await updateQueueJobResult(env.DB, requestId, "completed", {
					...meta,
					draftId,
					readyAt: now.toISOString(),
				});
				await env.STORAGE.delete(meta.imageKey);
			} catch (error) {
				if (!draftStored) await refundFuelJob(env, job, meta, deps);
				throw error;
			}
		},
		{
			getQueueJob: (async (db, id) => {
				const row = await loadJob(db, id);
				if (!row) return null;
				return {
					status: row.status,
					organizationId: row.organizationId,
					resultJson: row.resultJson,
					modelArtifact: row.modelArtifact,
					expiresAt: Math.floor(row.expiresAt.getTime() / 1000),
				};
			}) as typeof getQueueJob,
			claimQueueJobForProcessing,
		},
	);
}
