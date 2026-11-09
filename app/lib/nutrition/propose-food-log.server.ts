import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "~/db/schema";
import { callGemini } from "~/lib/ai-gateway.server";
import { AI_COSTS, withCreditGate } from "~/lib/ledger.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import { parseAiNutritionJson } from "./ai-estimate.server";
import { assertActiveNutritionConsent } from "./consent.server";
import { assertNutritionPhotoLog } from "./fast-log-flag.server";
import { lookupFoodBarcode } from "./food-barcode.server";
import {
	type FoodLogSubject,
	subjectSkipsExternalFoodApi,
} from "./food-log-cost";
import {
	hashNutritionRequest,
	type NutritionFlagContext,
	NutritionOperationConflictError,
	NutritionOperationInProgressError,
	NutritionOperationValidationError,
	type NutritionPrincipal,
	NutritionScopeError,
} from "./service.server";

export class FoodLogCapabilityError extends Error {
	readonly code = "capability_unavailable" as const;
	readonly status = 422;

	constructor(
		message = "A photo reference is required before a model food log can run.",
	) {
		super(message);
		this.name = "FoodLogCapabilityError";
	}
}

export class FoodLogCreditsError extends Error {
	readonly code = "insufficient_credits" as const;
	readonly status = 402;

	constructor() {
		super("Insufficient credits");
		this.name = "FoodLogCreditsError";
	}
}

export class FoodLogModelError extends Error {
	readonly code = "food_log_model_failed" as const;
	readonly status = 502;

	constructor() {
		super("Food log model failed");
		this.name = "FoodLogModelError";
	}
}

export type FoodLogLine = {
	name: string;
	energyKcal: number;
	proteinG: number;
	carbsG: number;
	fatG: number;
	fiberG: number | null;
	amount: number | null;
	unit: string | null;
	barcode: string | null;
	fdcId: string | null;
	compositionSource: string;
};

export type ProposeFoodLogResult = {
	draftId: string;
	replayed: boolean;
	credits: number;
	lines: FoodLogLine[];
	intakeId: null;
};

type Db = ReturnType<typeof drizzle<typeof schema>>;

const PHOTO_REASON = "Food log photo";

function requireScope(principal: NutritionPrincipal): void {
	if (principal.scopes && !principal.scopes.includes("nutrition:write")) {
		throw new NutritionScopeError("nutrition:write");
	}
}

function assertOperationKey(operationKey: string): void {
	if (
		!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
			operationKey,
		)
	) {
		throw new NutritionOperationValidationError("operationKey must be a UUID");
	}
}

function readResult(value: unknown): { draftId?: string; credits?: number } {
	if (typeof value === "string") {
		try {
			return JSON.parse(value) as { draftId?: string; credits?: number };
		} catch {
			return {};
		}
	}
	if (value && typeof value === "object") {
		return value as { draftId?: string; credits?: number };
	}
	return {};
}

function asLines(value: unknown): FoodLogLine[] {
	if (typeof value === "string") {
		try {
			return asLines(JSON.parse(value));
		} catch {
			return [];
		}
	}
	if (!Array.isArray(value)) return [];
	return value.filter(
		(line): line is FoodLogLine =>
			!!line &&
			typeof line === "object" &&
			typeof (line as FoodLogLine).name === "string",
	);
}

export async function readFoodLogPhoto(
	env: Env,
	principal: NutritionPrincipal,
	photoRef: string,
): Promise<FoodLogLine[]> {
	const result = await callGemini(env, {
		feature: "import_photo",
		parts: [
			{
				text: 'Identify each food in this photo. Return ONLY JSON {"lines":[{"name":"","energyKcal":0,"proteinG":0,"carbsG":0,"fatG":0,"fiberG":null}]}. Estimates are unverified. Do not include an email address.',
			},
			{ inlineData: { mimeType: "image/jpeg", data: photoRef } },
		],
		metadata: {
			organizationId: principal.organizationId,
			userId: principal.userId,
		},
	});
	if (!result.ok) throw new FoodLogModelError();
	const parsed = parseAiNutritionJson(result.text) as {
		lines?: Array<Record<string, unknown>>;
	} | null;
	const lines = parsed?.lines ?? [];
	if (lines.length === 0) throw new FoodLogModelError();
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

async function loadDraft(
	db: Db,
	userId: string,
	draftId: string,
): Promise<{ id: string; lines: FoodLogLine[]; credits: number } | null> {
	const [row] = await db
		.select()
		.from(schema.nutritionFoodDraft)
		.where(
			and(
				eq(schema.nutritionFoodDraft.id, draftId),
				eq(schema.nutritionFoodDraft.userId, userId),
			),
		)
		.limit(1);
	if (!row) return null;
	return {
		id: row.id,
		lines: asLines(row.linesJson),
		credits: row.credits,
	};
}

export async function proposeFoodLog(
	env: Env,
	principal: NutritionPrincipal,
	flags: NutritionFlagContext,
	input: {
		operationKey: string;
		photoRef?: string | null;
		subject?: FoodLogSubject;
		barcode?: string | null;
		now?: Date;
		model?: (photoRef: string) => Promise<FoodLogLine[]>;
		fetchImpl?: typeof fetch;
	},
): Promise<ProposeFoodLogResult> {
	requireScope(principal);
	assertOperationKey(input.operationKey);
	const photoRef = input.photoRef?.trim() ?? "";
	if (!photoRef) throw new FoodLogCapabilityError();
	await assertNutritionPhotoLog(env, flags);
	if (principal.surface === "mcp" || principal.surface === "copilot") {
		await assertActiveNutritionConsent(
			env.DB,
			principal.userId,
			"agent_processing",
		);
	}
	await assertActiveNutritionConsent(env.DB, principal.userId, "intake");

	const subject = input.subject ?? (input.barcode ? "packaged" : "custom");
	const now = input.now ?? new Date();
	const requestHash = await hashNutritionRequest({
		operationType: "propose_food_log",
		photoRef,
		subject,
		barcode: input.barcode ?? null,
	});
	const db = drizzle(env.DB, { schema });
	const existing = await db
		.select()
		.from(schema.nutritionOperation)
		.where(
			and(
				eq(schema.nutritionOperation.userId, principal.userId),
				eq(schema.nutritionOperation.operationKey, input.operationKey),
			),
		)
		.limit(1);
	const prior = existing[0];
	if (prior) {
		if (prior.requestHash !== requestHash) {
			throw new NutritionOperationConflictError();
		}
		if (prior.status === "in_progress") {
			throw new NutritionOperationInProgressError();
		}
		if (prior.status === "failed") throw new NutritionOperationConflictError();
		const stored = readResult(prior.resultJson);
		if (!stored.draftId) throw new NutritionOperationConflictError();
		const draft = await loadDraft(db, principal.userId, stored.draftId);
		if (!draft) throw new NutritionOperationConflictError();
		return {
			draftId: draft.id,
			replayed: true,
			credits: draft.credits,
			lines: draft.lines,
			intakeId: null,
		};
	}

	const rate = await checkRateLimit(env.RATION_KV, "scan", principal.userId);
	if (!rate.allowed) throw rateLimitResponse(rate);

	const operationId = crypto.randomUUID();
	await db.insert(schema.nutritionOperation).values({
		id: operationId,
		userId: principal.userId,
		organizationId: principal.organizationId,
		operationKey: input.operationKey,
		requestHash,
		operationType: "propose_food_log",
		status: "in_progress",
		itemCount: 1,
		createdAt: now,
	});

	const fail = async (error: unknown) => {
		await db
			.update(schema.nutritionOperation)
			.set({ status: "failed" })
			.where(eq(schema.nutritionOperation.id, operationId));
		throw error;
	};

	try {
		let lines: FoodLogLine[];
		const model =
			input.model ?? ((ref) => readFoodLogPhoto(env, principal, ref));
		try {
			lines = await withCreditGate(
				{
					env,
					organizationId: principal.organizationId,
					userId: principal.userId,
					cost: AI_COSTS.SCAN,
					reason: PHOTO_REASON,
				},
				() => model(photoRef),
			);
		} catch (error) {
			if (error instanceof Error && error.name === "InsufficientCreditsError") {
				throw new FoodLogCreditsError();
			}
			throw error instanceof FoodLogModelError ? error : error;
		}
		lines = lines.map((line) => ({
			...line,
			compositionSource: line.compositionSource || "ai_estimate",
		}));

		if (input.barcode && !subjectSkipsExternalFoodApi(subject)) {
			const hit = await lookupFoodBarcode(env, input.barcode, input.fetchImpl);
			if (hit.found && hit.macros) {
				lines = [
					{
						name: hit.name,
						energyKcal: hit.macros.energyKcal,
						proteinG: hit.macros.proteinG,
						carbsG: hit.macros.carbsG,
						fatG: hit.macros.fatG,
						fiberG: hit.macros.fiberG,
						amount: 1,
						unit: "serving",
						barcode: hit.gtinUpc,
						fdcId: hit.fdcId,
						compositionSource: "usda",
					},
				];
			}
		}

		const draftId = crypto.randomUUID();
		await db.insert(schema.nutritionFoodDraft).values({
			id: draftId,
			userId: principal.userId,
			organizationId: principal.organizationId,
			organizationNameSnapshot: null,
			operationId,
			subject,
			linesJson: lines,
			credits: AI_COSTS.SCAN,
			createdAt: now,
		});
		await db
			.update(schema.nutritionOperation)
			.set({
				status: "completed",
				completedAt: now,
				resultJson: { draftId, credits: AI_COSTS.SCAN },
			})
			.where(eq(schema.nutritionOperation.id, operationId));
		return {
			draftId,
			replayed: false,
			credits: AI_COSTS.SCAN,
			lines,
			intakeId: null,
		};
	} catch (error) {
		return fail(error);
	}
}
