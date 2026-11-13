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
import { assertFuelCreateRoom, assertFuelDayRoom } from "./fuel-cap.server";
import { FuelPhotoTooLargeError, FuelPhotoTypeError } from "./fuel-errors";
import { fuelPhotoClientStatus } from "./fuel-photo-status";
import type { FoodLogLine } from "./propose-food-log.server";
import type {
	NutritionFlagContext,
	NutritionPrincipal,
} from "./service.server";

const FUEL_PHOTO_REASON = "Fuel photo";
const JOB_TTL_MS = 60 * 60 * 1000;

/** One photo, one draft line. The portion is what the photo shows. */
export const FUEL_PHOTO_PROMPT =
	'Look at this photo and log one food. It may be a prepared plate, a set of ingredients, one ingredient, or a drink, and a beer counts. Estimate one portion from the visible size. Return ONLY JSON {"lines":[{"name":"","amount":1,"unit":"serving","energyKcal":0,"proteinG":0,"carbsG":0,"fatG":0,"fiberG":null}]}. One line. The numbers are an estimate, not medical advice. Do not include an email address.';

function finiteNumber(value: unknown, fallback: number): number {
	const number = Number(value);
	return Number.isFinite(number) ? number : fallback;
}

/** Several model lines still become one draft. Approve writes that one intake. */
export function collapseFuelPhotoLines(
	lines: Array<Record<string, unknown>>,
): FoodLogLine {
	const named = lines.filter(
		(line) => String(line.name ?? "").trim().length > 0,
	);
	const source = named.length > 0 ? named : lines;
	if (source.length === 0) throw new Error("fuel_photo_model");
	const first = source[0];
	const amount = finiteNumber(first?.amount, 1);
	const unit = String(first?.unit ?? "serving").trim() || "serving";
	const fiberValues = source.map((line) =>
		line.fiberG == null ? null : finiteNumber(line.fiberG, Number.NaN),
	);
	const fiberKnown = fiberValues.filter(
		(value): value is number => value != null && Number.isFinite(value),
	);
	return {
		name: source
			.map((line) => String(line.name ?? "Food").trim() || "Food")
			.join(", "),
		energyKcal: source.reduce(
			(sum, line) => sum + finiteNumber(line.energyKcal, 0),
			0,
		),
		proteinG: source.reduce(
			(sum, line) => sum + finiteNumber(line.proteinG, 0),
			0,
		),
		carbsG: source.reduce((sum, line) => sum + finiteNumber(line.carbsG, 0), 0),
		fatG: source.reduce((sum, line) => sum + finiteNumber(line.fatG, 0), 0),
		fiberG:
			fiberKnown.length === 0
				? null
				: fiberKnown.reduce((sum, value) => sum + value, 0),
		amount: amount > 0 ? amount : 1,
		unit,
		barcode: null,
		fdcId: null,
		compositionSource: "ai_estimate",
	};
}

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
			{ text: FUEL_PHOTO_PROMPT },
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
	return [collapseFuelPhotoLines(parsed?.lines ?? [])];
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
				imageKey: stored?.imageKey ?? meta.imageKey,
				mimeType: stored?.mimeType ?? meta.mimeType,
				operationId: stored?.operationId ?? meta.operationId,
				...(stored?.draftId ? { draftId: stored.draftId } : {}),
				...(stored?.readyAt ? { readyAt: stored.readyAt } : {}),
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
		fuelTimeZone?: string | null;
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
	const room = await assertFuelCreateRoom(
		env.DB,
		principal.userId,
		now,
		now,
		input.fuelTimeZone,
	);
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
			resultJson: { requestId, fuelDate: room.fuelDate },
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
	const db = drizzle(env.DB, { schema });
	const [operation] = await db
		.select({ resultJson: schema.nutritionOperation.resultJson })
		.from(schema.nutritionOperation)
		.where(eq(schema.nutritionOperation.id, meta.operationId))
		.limit(1);
	const stored = operation?.resultJson?.fuelDate;
	const pinned =
		typeof stored === "string" && stored.length > 0
			? stored
			: (
					await assertFuelCreateRoom(
						env.DB,
						principal.userId,
						occurredAt,
						now,
						input.fuelTimeZone,
					)
				).fuelDate;
	if (typeof stored === "string" && stored.length > 0) {
		await assertFuelDayRoom(env.DB, principal.userId, stored, now);
	}
	return (deps.logIntake ?? logDiaryFood)(env, principal, flags, {
		...input,
		pinnedFuelDate: pinned,
	});
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
				const storedFuelDate = operation?.resultJson?.fuelDate;
				const fuelDate =
					typeof storedFuelDate === "string" && storedFuelDate.length > 0
						? storedFuelDate
						: undefined;
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
						resultJson: {
							draftId,
							requestId,
							...(fuelDate ? { fuelDate } : {}),
						},
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
