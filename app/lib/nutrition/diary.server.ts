import { and, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "~/db/schema";
import { CapacityExceededError, checkCapacity } from "~/lib/capacity.server";
import { isFeatureEnabled } from "~/lib/feature-flags/flags.server";
import {
	formatISODateInTimeZone,
	resolveKitchenTimeZone,
} from "~/lib/kitchen-time";
import { getOrganizationMetadata } from "~/lib/org-supply-settings.server";
import type { DiaryFoodWrite } from "~/lib/schemas/diary";
import type { OrganizationMetadata } from "~/lib/types";
import { assertActiveNutritionConsent } from "./consent.server";
import type { DiaryNutritionOperationType } from "./diary-operations";
import {
	assertNutritionFastLog,
	assertNutritionSavedFood,
} from "./fast-log-flag.server";
import { listFdcPortions } from "./fdc-portion.server";
import {
	resolveHouseholdPortion,
	storedPortionFromFdc,
} from "./household-portion";
import { copySavedFoodOntoWrite } from "./saved-food";
import { loadOwnedSavedFood } from "./saved-food.server";
import {
	AmountUnitUnavailableError,
	hashNutritionRequest,
	intakeNotesForCanonicalHash,
	type NutritionFlagContext,
	NutritionItemConflictError,
	NutritionOperationConflictError,
	NutritionOperationInProgressError,
	NutritionOperationValidationError,
	type NutritionPrincipal,
	NutritionScopeError,
	resolveIntakeNotesForWrite,
} from "./service.server";

/** Typed and custom diary logs debit nothing. Photo debit is a later MR. */
export const DIARY_TYPED_LOG_CREDITS = 0;

type Db = ReturnType<typeof drizzle<typeof schema>>;
type IntakeInsert = typeof schema.nutritionIntake.$inferInsert;
type IntakeRow = typeof schema.nutritionIntake.$inferSelect;
type OperationRow = typeof schema.nutritionOperation.$inferSelect;

export class DiaryConfirmationRequiredError extends Error {
	readonly code = "confirmation_required" as const;
	readonly status = 400;

	constructor(
		message = "Pass confirm:true before this kitchen or void write.",
	) {
		super(message);
		this.name = "DiaryConfirmationRequiredError";
	}
}

export class DiaryFoodNotFoundError extends Error {
	readonly code = "not_found" as const;
	readonly status = 404;

	constructor() {
		super("Diary food not found");
		this.name = "DiaryFoodNotFoundError";
	}
}

export type DiaryKitchenOffer = { cargo: true; galley: true };

export type DiaryLogResult = {
	operationId: string;
	intakeId: string;
	replayed: boolean;
	credits: number;
	kitchenOffer: DiaryKitchenOffer;
	manifestDate: string;
	entryId: null;
};

export type DiaryVoidResult = {
	operationId: string;
	intakeId: string;
	replayed: boolean;
	voided: true;
};

export type DiaryKitchenSaveResult = {
	operationId: string;
	intakeId: string;
	target: "cargo" | "meal";
	kitchenItemId: string;
	replayed: boolean;
};

const KITCHEN_OFFER: DiaryKitchenOffer = { cargo: true, galley: true };

function requireScope(
	principal: NutritionPrincipal,
	requiredScope: "nutrition:read" | "nutrition:write",
): void {
	if (principal.scopes && !principal.scopes.includes(requiredScope)) {
		throw new NutritionScopeError(requiredScope);
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

function errorText(error: unknown): string {
	const messages: string[] = [];
	let current: unknown = error;
	for (let depth = 0; depth < 5 && current != null; depth++) {
		if (current instanceof Error) {
			messages.push(current.message);
			current = current.cause;
		} else {
			messages.push(String(current));
			break;
		}
	}
	return messages.join("\n").toLowerCase();
}

function manifestDateForInstant(
	occurredAt: Date,
	metadata: OrganizationMetadata | null,
): string {
	const zone = resolveKitchenTimeZone(metadata);
	return formatISODateInTimeZone(occurredAt, zone ?? "UTC");
}

function normalizeDiaryUnit(unit: string | null | undefined): string | null {
	if (unit == null) return null;
	const trimmed = unit.trim().toLowerCase();
	if (!trimmed || trimmed.length > 40) {
		throw new NutritionOperationValidationError("unit is not valid");
	}
	return trimmed;
}

type ResolvedFood = {
	name: string;
	manifestDate: string;
	occurredAt: Date;
	slotType: string | null;
	servings: number;
	loggedAmount: number | null;
	loggedUnit: string | null;
	energyKcal: number;
	proteinG: number;
	carbsG: number;
	fatG: number;
	fiberG: number | null;
	idempotencyKey: string;
	requestedNotes: string | null;
};

type CompleteFoodWrite = Omit<DiaryFoodWrite, "name" | "macros"> & {
	name: string;
	macros: NonNullable<DiaryFoodWrite["macros"]>;
};

function resolveFood(
	input: CompleteFoodWrite,
	metadata: OrganizationMetadata | null,
	now: Date,
): ResolvedFood {
	const unit = normalizeDiaryUnit(input.unit ?? null);
	const occurredAt = input.occurredAt ? new Date(input.occurredAt) : now;
	if (Number.isNaN(occurredAt.getTime())) {
		throw new NutritionOperationValidationError(
			"occurredAt must be a timestamp",
		);
	}
	const manifestDate = input.occurredAt
		? manifestDateForInstant(occurredAt, metadata)
		: (input.manifestDate ?? manifestDateForInstant(occurredAt, metadata));
	const amount = input.amount ?? null;
	const servings = unit === "serving" && amount != null ? amount : 1;
	if (servings < 0.01 || servings > 100) {
		throw new NutritionOperationValidationError(
			"A serving amount must be between 0.01 and 100",
		);
	}
	return {
		name: input.name.trim(),
		manifestDate,
		occurredAt,
		slotType: input.slotType ?? null,
		servings,
		loggedAmount: amount,
		loggedUnit: unit,
		energyKcal: input.macros.energyKcal,
		proteinG: input.macros.proteinG,
		carbsG: input.macros.carbsG,
		fatG: input.macros.fatG,
		fiberG: input.macros.fiberG ?? null,
		idempotencyKey: input.idempotencyKey,
		requestedNotes: input.notes ?? null,
	};
}

function canonicalBody(
	food: ResolvedFood,
	notesEnabled: boolean,
	operationType: DiaryNutritionOperationType,
	extra: Record<string, unknown> = {},
) {
	return {
		operationType,
		name: food.name,
		manifestDate: food.manifestDate,
		occurredAt: food.occurredAt.toISOString(),
		slotType: food.slotType,
		servings: food.servings,
		loggedAmount: food.loggedAmount,
		loggedUnit: food.loggedUnit,
		energyKcal: food.energyKcal,
		proteinG: food.proteinG,
		carbsG: food.carbsG,
		fatG: food.fatG,
		fiberG: food.fiberG,
		idempotencyKey: food.idempotencyKey,
		...intakeNotesForCanonicalHash(notesEnabled, food.requestedNotes),
		...extra,
	};
}

async function loadOperation(
	db: Db,
	principal: NutritionPrincipal,
	operationKey: string,
): Promise<OperationRow | null> {
	const [operation] = await db
		.select()
		.from(schema.nutritionOperation)
		.where(
			and(
				eq(schema.nutritionOperation.userId, principal.userId),
				eq(schema.nutritionOperation.operationKey, operationKey),
			),
		)
		.limit(1);
	if (!operation) return null;
	if (operation.organizationId !== principal.organizationId) {
		throw new NutritionOperationConflictError();
	}
	return operation;
}

function assertReplay(
	operation: OperationRow,
	requestHash: string,
	operationType: DiaryNutritionOperationType,
): void {
	if (
		operation.requestHash !== requestHash ||
		operation.operationType !== operationType ||
		operation.itemCount !== 1
	) {
		throw new NutritionOperationConflictError();
	}
	if (operation.status === "in_progress") {
		throw new NutritionOperationInProgressError();
	}
	if (operation.status !== "completed") {
		throw new NutritionOperationConflictError();
	}
}

async function orgName(db: Db, organizationId: string): Promise<string> {
	const [row] = await db
		.select({ name: schema.organization.name })
		.from(schema.organization)
		.where(eq(schema.organization.id, organizationId))
		.limit(1);
	return row?.name?.trim() || "Kitchen";
}

async function loadOwned(
	db: Db,
	userId: string,
	intakeId: string,
): Promise<IntakeRow | null> {
	const [row] = await db
		.select()
		.from(schema.nutritionIntake)
		.where(
			and(
				eq(schema.nutritionIntake.id, intakeId),
				eq(schema.nutritionIntake.userId, userId),
			),
		)
		.limit(1);
	return row ?? null;
}

async function loadByIdempotency(
	db: Db,
	userId: string,
	idempotencyKey: string,
): Promise<IntakeRow | null> {
	const [row] = await db
		.select()
		.from(schema.nutritionIntake)
		.where(
			and(
				eq(schema.nutritionIntake.userId, userId),
				eq(schema.nutritionIntake.idempotencyKey, idempotencyKey),
			),
		)
		.limit(1);
	return row ?? null;
}

function sameFood(
	row: IntakeRow,
	food: ResolvedFood,
	notes: string | null,
): boolean {
	return (
		(row.mealNameSnapshot ?? "") === food.name &&
		row.manifestDate === food.manifestDate &&
		row.occurredAt.getTime() === food.occurredAt.getTime() &&
		(row.slotType ?? null) === food.slotType &&
		row.servings === food.servings &&
		(row.loggedAmount ?? null) === food.loggedAmount &&
		(row.loggedUnit ?? null) === food.loggedUnit &&
		row.energyKcal === food.energyKcal &&
		row.proteinG === food.proteinG &&
		row.carbsG === food.carbsG &&
		row.fatG === food.fatG &&
		(row.fiberG ?? null) === food.fiberG &&
		(row.notes ?? null) === notes
	);
}

function intakeInsert(
	food: ResolvedFood,
	input: {
		id: string;
		principal: NutritionPrincipal;
		organizationName: string;
		consentId: string;
		operationId: string;
		notes: string | null;
		now: Date;
		replacesIntakeId: string | null;
		healthSyncId: string;
		healthSyncVersion: number;
		savedFoodId: string | null;
		barcode: string | null;
		fdcId: string | null;
	},
): IntakeInsert {
	return {
		id: input.id,
		organizationId: input.principal.organizationId,
		userId: input.principal.userId,
		planId: null,
		entryId: null,
		mealId: null,
		organizationNameSnapshot: input.organizationName,
		mealNameSnapshot: food.name,
		manifestDate: food.manifestDate,
		slotType: food.slotType,
		servings: food.servings,
		energyKcal: food.energyKcal,
		proteinG: food.proteinG,
		carbsG: food.carbsG,
		fatG: food.fatG,
		fiberG: food.fiberG,
		coverage: 1,
		source: "diary",
		confidence: 1,
		verified: 0,
		occurredAt: food.occurredAt,
		kitchenEventId: null,
		schemaVersion: 2,
		nutrientsJson: {
			energyKcal: food.energyKcal,
			proteinG: food.proteinG,
			carbsG: food.carbsG,
			fatG: food.fatG,
			fiberG: food.fiberG,
		},
		coverageJson: { overall: 1 },
		consentId: input.consentId,
		idempotencyKey: food.idempotencyKey,
		operationId: input.operationId,
		replacesIntakeId: input.replacesIntakeId,
		voidOperationId: null,
		voidedAt: null,
		voidedByUserId: null,
		notes: input.notes,
		loggedAmount: food.loggedAmount,
		loggedUnit: food.loggedUnit,
		healthSyncId: input.healthSyncId,
		healthSyncVersion: input.healthSyncVersion,
		compositionSource: "manual_macros",
		compositionConfirmedAt: input.now,
		fdcId: input.fdcId,
		barcode: input.barcode,
		savedFoodId: input.savedFoodId,
		createdAt: input.now,
	};
}

/**
 * Typed personal logs debit 0. The call sits after the operation row is stored
 * and before the intake batch. It must not call withCreditGate.
 */
export function chargeDiaryFoodLog(): number {
	return DIARY_TYPED_LOG_CREDITS;
}

async function reserveOperation(
	db: Db,
	principal: NutritionPrincipal,
	input: {
		operationId: string;
		operationKey: string;
		requestHash: string;
		operationType: DiaryNutritionOperationType;
		now: Date;
	},
): Promise<void> {
	await db.insert(schema.nutritionOperation).values({
		id: input.operationId,
		userId: principal.userId,
		organizationId: principal.organizationId,
		operationKey: input.operationKey,
		requestHash: input.requestHash,
		operationType: input.operationType,
		status: "in_progress",
		itemCount: 1,
		createdAt: input.now,
	});
}

async function markOperationFailed(db: Db, operationId: string): Promise<void> {
	await db
		.update(schema.nutritionOperation)
		.set({ status: "failed" })
		.where(
			and(
				eq(schema.nutritionOperation.id, operationId),
				eq(schema.nutritionOperation.status, "in_progress"),
			),
		);
}

function logResult(
	operationId: string,
	row: { id: string; manifestDate: string },
	replayed: boolean,
): DiaryLogResult {
	return {
		operationId,
		intakeId: row.id,
		replayed,
		credits: DIARY_TYPED_LOG_CREDITS,
		kitchenOffer: KITCHEN_OFFER,
		manifestDate: row.manifestDate,
		entryId: null,
	};
}

async function prepareWrite(
	env: Env,
	principal: NutritionPrincipal,
	flags: NutritionFlagContext,
	operationKey: string,
) {
	requireScope(principal, "nutrition:write");
	assertOperationKey(operationKey);
	await assertNutritionFastLog(env, flags);
	if (principal.surface === "mcp" || principal.surface === "copilot") {
		await assertActiveNutritionConsent(
			env.DB,
			principal.userId,
			"agent_processing",
		);
	}
	const intakeConsent = await assertActiveNutritionConsent(
		env.DB,
		principal.userId,
		"intake",
	);
	const notesEnabled = await isFeatureEnabled(
		env,
		"nutrition-intake-notes",
		flags,
	);
	const db = drizzle(env.DB, { schema });
	const metadata = await getOrganizationMetadata(
		env.DB,
		principal.organizationId,
	);
	return { db, intakeConsent, notesEnabled, metadata };
}

type SavedFoodProvenance = {
	food: ResolvedFood;
	savedFoodId: string | null;
	barcode: string | null;
	fdcId: string | null;
};

function diaryClock(
	input: DiaryFoodWrite,
	metadata: OrganizationMetadata | null,
	now: Date,
): { occurredAt: Date; manifestDate: string } {
	const occurredAt = input.occurredAt ? new Date(input.occurredAt) : now;
	if (Number.isNaN(occurredAt.getTime())) {
		throw new NutritionOperationValidationError(
			"occurredAt must be a timestamp",
		);
	}
	const manifestDate = input.occurredAt
		? manifestDateForInstant(occurredAt, metadata)
		: (input.manifestDate ?? manifestDateForInstant(occurredAt, metadata));
	return { occurredAt, manifestDate };
}

/**
 * A saved-food log is identified by the id, not the live nutrients, so a later
 * edit or delete of the saved food does not change the hash of a replay.
 */
function savedFoodRequestIdentity(
	input: DiaryFoodWrite & { savedFoodId: string },
	metadata: OrganizationMetadata | null,
	now: Date,
	notesEnabled: boolean,
	notes: string | null,
	operationType: DiaryNutritionOperationType,
	extra: Record<string, unknown> = {},
) {
	const clock = diaryClock(input, metadata, now);
	return {
		operationType,
		savedFoodId: input.savedFoodId,
		manifestDate: clock.manifestDate,
		occurredAt: clock.occurredAt.toISOString(),
		slotType: input.slotType ?? null,
		idempotencyKey: input.idempotencyKey,
		...intakeNotesForCanonicalHash(notesEnabled, notes),
		...extra,
	};
}

async function materializeFood(
	env: Env,
	principal: NutritionPrincipal,
	flags: NutritionFlagContext,
	input: DiaryFoodWrite,
	metadata: OrganizationMetadata | null,
	now: Date,
): Promise<SavedFoodProvenance> {
	if (!input.savedFoodId) {
		if (!input.name) {
			throw new NutritionOperationValidationError(
				"A personal food log needs a name and macros, or a saved food id.",
			);
		}
		if (input.macros) {
			return {
				food: resolveFood(
					{ ...input, name: input.name, macros: input.macros },
					metadata,
					now,
				),
				savedFoodId: null,
				barcode: null,
				fdcId: input.fdcId ?? null,
			};
		}
		if (!input.per100g) {
			throw new NutritionOperationValidationError(
				"A personal food log needs a name and macros, or a saved food id.",
			);
		}
		const fdcId = input.fdcId != null ? Number(input.fdcId) : null;
		const rows =
			fdcId != null && Number.isFinite(fdcId)
				? await listFdcPortions(env, fdcId)
				: [];
		const portions = rows.flatMap((row) => {
			const portion = storedPortionFromFdc(row);
			return portion ? [portion] : [];
		});
		const scaled = resolveHouseholdPortion({
			amount: input.amount,
			unit: input.unit,
			per100g: {
				energyKcal: input.per100g.energyKcal,
				proteinG: input.per100g.proteinG,
				carbsG: input.per100g.carbsG,
				fatG: input.per100g.fatG,
				fiberG: input.per100g.fiberG ?? null,
			},
			portions,
		});
		if (!scaled.ok) {
			throw new AmountUnitUnavailableError(scaled.message, scaled.allowedUnits);
		}
		return {
			food: resolveFood(
				{ ...input, name: input.name, macros: scaled.macros },
				metadata,
				now,
			),
			savedFoodId: null,
			barcode: null,
			fdcId: input.fdcId ?? null,
		};
	}
	await assertNutritionSavedFood(env, flags);
	const saved = await loadOwnedSavedFood(
		env.DB,
		principal.userId,
		input.savedFoodId,
	);
	if (!saved) throw new DiaryFoodNotFoundError();
	const copied = copySavedFoodOntoWrite(saved);
	return {
		food: resolveFood(
			{
				...input,
				name: copied.name,
				macros: copied.macros,
				amount: copied.amount,
				unit: copied.unit,
			},
			metadata,
			now,
		),
		savedFoodId: copied.savedFoodId,
		barcode: copied.barcode,
		fdcId: copied.fdcId,
	};
}

export async function logDiaryFood(
	env: Env,
	principal: NutritionPrincipal,
	flags: NutritionFlagContext,
	input: DiaryFoodWrite & { now?: Date },
): Promise<DiaryLogResult> {
	const prepared = await prepareWrite(
		env,
		principal,
		flags,
		input.operationKey,
	);
	const { db, intakeConsent, notesEnabled, metadata } = prepared;
	const now = input.now ?? new Date();
	const previewNotes = resolveIntakeNotesForWrite({
		notesEnabled,
		requestedNotes: input.notes ?? null,
		priorNotes: null,
	});
	const savedIdentity = input.savedFoodId
		? await hashNutritionRequest(
				savedFoodRequestIdentity(
					{ ...input, savedFoodId: input.savedFoodId },
					metadata,
					now,
					notesEnabled,
					previewNotes,
					"log_diary_food",
				),
			)
		: null;
	if (savedIdentity) {
		const existing = await loadOperation(db, principal, input.operationKey);
		if (existing) {
			assertReplay(existing, savedIdentity, "log_diary_food");
			const storedId = existing.resultJson?.intakeId;
			const row = storedId
				? await loadOwned(db, principal.userId, storedId)
				: null;
			if (!row) throw new DiaryFoodNotFoundError();
			return logResult(existing.id, row, true);
		}
	}
	const materialized = await materializeFood(
		env,
		principal,
		flags,
		input,
		metadata,
		now,
	);
	const food = materialized.food;
	const notes = resolveIntakeNotesForWrite({
		notesEnabled,
		requestedNotes: food.requestedNotes,
		priorNotes: null,
	});
	const requestHash =
		savedIdentity ??
		(await hashNutritionRequest(
			canonicalBody(food, notesEnabled, "log_diary_food"),
		));
	const existing = await loadOperation(db, principal, input.operationKey);
	if (existing) {
		assertReplay(existing, requestHash, "log_diary_food");
		const storedId = existing.resultJson?.intakeId;
		const row = storedId
			? await loadOwned(db, principal.userId, storedId)
			: await loadByIdempotency(db, principal.userId, food.idempotencyKey);
		if (!row) throw new DiaryFoodNotFoundError();
		return logResult(existing.id, row, true);
	}

	const priorKey = await loadByIdempotency(
		db,
		principal.userId,
		food.idempotencyKey,
	);
	if (priorKey) {
		if (!sameFood(priorKey, food, notes))
			throw new NutritionItemConflictError();
		return logResult(priorKey.operationId ?? priorKey.id, priorKey, true);
	}

	const operationId = crypto.randomUUID();
	const intakeId = crypto.randomUUID();
	try {
		await reserveOperation(db, principal, {
			operationId,
			operationKey: input.operationKey,
			requestHash,
			operationType: "log_diary_food",
			now,
		});
	} catch (error) {
		if (errorText(error).includes("unique")) {
			const raced = await loadOperation(db, principal, input.operationKey);
			if (raced) {
				assertReplay(raced, requestHash, "log_diary_food");
				const storedId = raced.resultJson?.intakeId;
				const row = storedId
					? await loadOwned(db, principal.userId, storedId)
					: null;
				if (!row) throw new NutritionOperationInProgressError();
				return logResult(raced.id, row, true);
			}
		}
		throw error;
	}

	const credits = chargeDiaryFoodLog();
	const row = intakeInsert(food, {
		id: intakeId,
		principal,
		organizationName: await orgName(db, principal.organizationId),
		consentId: intakeConsent.id,
		operationId,
		notes,
		now,
		replacesIntakeId: null,
		healthSyncId: crypto.randomUUID(),
		healthSyncVersion: 1,
		savedFoodId: materialized.savedFoodId,
		barcode: materialized.barcode,
		fdcId: materialized.fdcId,
	});
	try {
		await db.batch([
			db.insert(schema.nutritionIntake).values(row),
			db
				.update(schema.nutritionOperation)
				.set({
					status: "completed",
					completedAt: now,
					resultJson: {
						summaryGeneratedAt: now.toISOString(),
						intakeId,
						credits,
					},
				})
				.where(eq(schema.nutritionOperation.id, operationId)),
			db.insert(schema.nutritionAccessAudit).values({
				id: crypto.randomUUID(),
				userId: principal.userId,
				organizationId: principal.organizationId,
				surface: principal.surface,
				authMethod: principal.authMethod,
				credentialId: principal.credentialId ?? null,
				clientId: principal.clientId ?? null,
				eventType: "nutrition_intake_write",
				requiredScope: "nutrition:write",
				consentPurpose: "intake",
				consentPolicyVersion: intakeConsent.statement.policyVersion,
				outcome: "success",
				replayed: false,
				itemCountBucket: "1",
				requestId: principal.requestId ?? input.operationKey,
				operationId,
				occurredAt: now,
			}),
		]);
	} catch (error) {
		await markOperationFailed(db, operationId);
		if (errorText(error).includes("nutrition_intake_user_idempotency_uidx")) {
			throw new NutritionItemConflictError();
		}
		throw error;
	}
	return logResult(
		operationId,
		{ id: intakeId, manifestDate: row.manifestDate },
		false,
	);
}

export async function updateDiaryFood(
	env: Env,
	principal: NutritionPrincipal,
	flags: NutritionFlagContext,
	intakeId: string,
	input: DiaryFoodWrite & { now?: Date },
): Promise<DiaryLogResult> {
	const prepared = await prepareWrite(
		env,
		principal,
		flags,
		input.operationKey,
	);
	const { db, intakeConsent, notesEnabled, metadata } = prepared;
	const now = input.now ?? new Date();
	const current = await loadOwned(db, principal.userId, intakeId);
	if (!current || current.voidedAt) throw new DiaryFoodNotFoundError();
	const previewNotes = resolveIntakeNotesForWrite({
		notesEnabled,
		requestedNotes: input.notes ?? null,
		priorNotes: current.notes,
	});
	const savedIdentity = input.savedFoodId
		? await hashNutritionRequest(
				savedFoodRequestIdentity(
					{ ...input, savedFoodId: input.savedFoodId },
					metadata,
					now,
					notesEnabled,
					previewNotes,
					"update_diary_food",
					{ intakeId },
				),
			)
		: null;
	if (savedIdentity) {
		const existingSaved = await loadOperation(
			db,
			principal,
			input.operationKey,
		);
		if (existingSaved) {
			assertReplay(existingSaved, savedIdentity, "update_diary_food");
			const storedId = existingSaved.resultJson?.intakeId;
			const row = storedId
				? await loadOwned(db, principal.userId, storedId)
				: null;
			if (!row) throw new DiaryFoodNotFoundError();
			return logResult(existingSaved.id, row, true);
		}
	}
	const materialized = await materializeFood(
		env,
		principal,
		flags,
		input,
		metadata,
		now,
	);
	const food = materialized.food;
	const notes = resolveIntakeNotesForWrite({
		notesEnabled,
		requestedNotes: food.requestedNotes,
		priorNotes: current.notes,
	});
	const requestHash =
		savedIdentity ??
		(await hashNutritionRequest(
			canonicalBody(food, notesEnabled, "update_diary_food", { intakeId }),
		));
	const existing = await loadOperation(db, principal, input.operationKey);
	if (existing) {
		assertReplay(existing, requestHash, "update_diary_food");
		const storedId = existing.resultJson?.intakeId;
		const row = storedId
			? await loadOwned(db, principal.userId, storedId)
			: null;
		if (!row) throw new DiaryFoodNotFoundError();
		return logResult(existing.id, row, true);
	}

	const nutrientsChanged =
		current.energyKcal !== food.energyKcal ||
		current.proteinG !== food.proteinG ||
		current.carbsG !== food.carbsG ||
		current.fatG !== food.fatG ||
		(current.fiberG ?? null) !== food.fiberG;
	const operationId = crypto.randomUUID();
	const nextId = crypto.randomUUID();
	await reserveOperation(db, principal, {
		operationId,
		operationKey: input.operationKey,
		requestHash,
		operationType: "update_diary_food",
		now,
	});
	const credits = chargeDiaryFoodLog();
	const row = intakeInsert(food, {
		id: nextId,
		principal,
		organizationName:
			current.organizationNameSnapshot ||
			(await orgName(db, principal.organizationId)),
		consentId: intakeConsent.id,
		operationId,
		notes,
		now,
		replacesIntakeId: current.id,
		healthSyncId: current.healthSyncId ?? crypto.randomUUID(),
		healthSyncVersion:
			(current.healthSyncVersion ?? 1) + (nutrientsChanged ? 1 : 0),
		savedFoodId: materialized.savedFoodId,
		barcode: materialized.barcode,
		fdcId: materialized.fdcId,
	});
	try {
		await db.batch([
			db
				.update(schema.nutritionIntake)
				.set({
					voidedAt: now,
					voidedByUserId: principal.userId,
					voidOperationId: operationId,
				})
				.where(
					and(
						eq(schema.nutritionIntake.id, current.id),
						eq(schema.nutritionIntake.userId, principal.userId),
						isNull(schema.nutritionIntake.voidedAt),
					),
				),
			db.insert(schema.nutritionIntake).values(row),
			db
				.update(schema.nutritionOperation)
				.set({
					status: "completed",
					completedAt: now,
					resultJson: {
						summaryGeneratedAt: now.toISOString(),
						intakeId: nextId,
						credits,
					},
				})
				.where(eq(schema.nutritionOperation.id, operationId)),
			db.insert(schema.nutritionAccessAudit).values({
				id: crypto.randomUUID(),
				userId: principal.userId,
				organizationId: principal.organizationId,
				surface: principal.surface,
				authMethod: principal.authMethod,
				credentialId: principal.credentialId ?? null,
				clientId: principal.clientId ?? null,
				eventType: "nutrition_intake_write",
				requiredScope: "nutrition:write",
				consentPurpose: "intake",
				consentPolicyVersion: intakeConsent.statement.policyVersion,
				outcome: "success",
				replayed: false,
				itemCountBucket: "1",
				requestId: principal.requestId ?? input.operationKey,
				operationId,
				occurredAt: now,
			}),
		]);
	} catch (error) {
		await markOperationFailed(db, operationId);
		throw error;
	}
	return logResult(
		operationId,
		{ id: nextId, manifestDate: row.manifestDate },
		false,
	);
}

export async function voidDiaryFood(
	env: Env,
	principal: NutritionPrincipal,
	flags: NutritionFlagContext,
	intakeId: string,
	input: { confirm: boolean; operationKey: string; now?: Date },
): Promise<DiaryVoidResult> {
	if (!input.confirm) throw new DiaryConfirmationRequiredError();
	const prepared = await prepareWrite(
		env,
		principal,
		flags,
		input.operationKey,
	);
	const { db, intakeConsent } = prepared;
	const now = input.now ?? new Date();
	const requestHash = await hashNutritionRequest({
		operationType: "void_diary_food",
		intakeId,
		confirm: true,
	});
	const existing = await loadOperation(db, principal, input.operationKey);
	if (existing) {
		assertReplay(existing, requestHash, "void_diary_food");
		return {
			operationId: existing.id,
			intakeId,
			replayed: true,
			voided: true,
		};
	}
	const current = await loadOwned(db, principal.userId, intakeId);
	if (!current || current.voidedAt) throw new DiaryFoodNotFoundError();
	const operationId = crypto.randomUUID();
	await reserveOperation(db, principal, {
		operationId,
		operationKey: input.operationKey,
		requestHash,
		operationType: "void_diary_food",
		now,
	});
	chargeDiaryFoodLog();
	try {
		await db.batch([
			db
				.update(schema.nutritionIntake)
				.set({
					voidedAt: now,
					voidedByUserId: principal.userId,
					voidOperationId: operationId,
				})
				.where(
					and(
						eq(schema.nutritionIntake.id, current.id),
						eq(schema.nutritionIntake.userId, principal.userId),
						isNull(schema.nutritionIntake.voidedAt),
					),
				),
			db
				.update(schema.nutritionOperation)
				.set({
					status: "completed",
					completedAt: now,
					resultJson: {
						summaryGeneratedAt: now.toISOString(),
						intakeId,
						credits: 0,
					},
				})
				.where(eq(schema.nutritionOperation.id, operationId)),
			db.insert(schema.nutritionAccessAudit).values({
				id: crypto.randomUUID(),
				userId: principal.userId,
				organizationId: principal.organizationId,
				surface: principal.surface,
				authMethod: principal.authMethod,
				credentialId: principal.credentialId ?? null,
				clientId: principal.clientId ?? null,
				eventType: "nutrition_intake_write",
				requiredScope: "nutrition:write",
				consentPurpose: "intake",
				consentPolicyVersion: intakeConsent.statement.policyVersion,
				outcome: "success",
				replayed: false,
				itemCountBucket: "1",
				requestId: principal.requestId ?? input.operationKey,
				operationId,
				occurredAt: now,
			}),
		]);
	} catch (error) {
		await markOperationFailed(db, operationId);
		throw error;
	}
	return { operationId, intakeId, replayed: false, voided: true };
}

export async function saveDiaryFoodToKitchen(
	env: Env,
	principal: NutritionPrincipal,
	flags: NutritionFlagContext,
	intakeId: string,
	input: {
		confirm: boolean;
		target: "cargo" | "meal";
		operationKey: string;
		now?: Date;
	},
): Promise<DiaryKitchenSaveResult> {
	if (!input.confirm) throw new DiaryConfirmationRequiredError();
	const prepared = await prepareWrite(
		env,
		principal,
		flags,
		input.operationKey,
	);
	const { db, intakeConsent } = prepared;
	const now = input.now ?? new Date();
	const requestHash = await hashNutritionRequest({
		operationType: "save_diary_food_to_kitchen",
		intakeId,
		target: input.target,
		confirm: true,
	});
	const existing = await loadOperation(db, principal, input.operationKey);
	if (existing) {
		assertReplay(existing, requestHash, "save_diary_food_to_kitchen");
		const kitchenItemId = existing.resultJson?.kitchenItemId;
		if (!kitchenItemId) throw new DiaryFoodNotFoundError();
		return {
			operationId: existing.id,
			intakeId,
			target: input.target,
			kitchenItemId,
			replayed: true,
		};
	}
	const current = await loadOwned(db, principal.userId, intakeId);
	if (!current || current.voidedAt) throw new DiaryFoodNotFoundError();
	const resource = input.target === "cargo" ? "cargo" : "meals";
	const capacity = await checkCapacity(
		env,
		principal.organizationId,
		resource,
		1,
	);
	if (!capacity.allowed) {
		throw new CapacityExceededError({
			resource,
			current: capacity.current,
			limit: capacity.limit,
			tier: capacity.tier,
			isExpired: capacity.isExpired,
			canAdd: capacity.canAdd,
		});
	}
	const operationId = crypto.randomUUID();
	const kitchenItemId = crypto.randomUUID();
	await reserveOperation(db, principal, {
		operationId,
		operationKey: input.operationKey,
		requestHash,
		operationType: "save_diary_food_to_kitchen",
		now,
	});
	chargeDiaryFoodLog();
	const name = current.mealNameSnapshot?.trim() || "Logged food";
	const unit =
		current.loggedUnit === "g" || current.loggedUnit === "oz"
			? current.loggedUnit
			: "unit";
	const quantity = unit === "unit" ? 1 : (current.loggedAmount ?? 1);
	try {
		const write =
			input.target === "cargo"
				? db.insert(schema.cargo).values({
						id: kitchenItemId,
						organizationId: principal.organizationId,
						name,
						quantity,
						unit,
						baseQuantity: 1,
						baseUnit: "unit",
						domain: "food",
						status: "stable",
						createdAt: now,
						updatedAt: now,
					})
				: db.insert(schema.meal).values({
						id: kitchenItemId,
						organizationId: principal.organizationId,
						name,
						domain: "food",
						type: "recipe",
						servings: 1,
						createdAt: now,
						updatedAt: now,
					});
		await db.batch([
			write,
			db
				.update(schema.nutritionOperation)
				.set({
					status: "completed",
					completedAt: now,
					resultJson: {
						summaryGeneratedAt: now.toISOString(),
						intakeId,
						credits: 0,
						kitchenItemId,
						target: input.target,
					},
				})
				.where(eq(schema.nutritionOperation.id, operationId)),
			db.insert(schema.nutritionAccessAudit).values({
				id: crypto.randomUUID(),
				userId: principal.userId,
				organizationId: principal.organizationId,
				surface: principal.surface,
				authMethod: principal.authMethod,
				credentialId: principal.credentialId ?? null,
				clientId: principal.clientId ?? null,
				eventType: "nutrition_intake_write",
				requiredScope: "nutrition:write",
				consentPurpose: "intake",
				consentPolicyVersion: intakeConsent.statement.policyVersion,
				outcome: "success",
				replayed: false,
				itemCountBucket: "1",
				requestId: principal.requestId ?? input.operationKey,
				operationId,
				occurredAt: now,
			}),
		]);
	} catch (error) {
		await markOperationFailed(db, operationId);
		throw error;
	}
	const unchanged = await loadOwned(db, principal.userId, intakeId);
	if (
		!unchanged ||
		unchanged.userId !== current.userId ||
		unchanged.organizationId !== current.organizationId ||
		unchanged.voidedAt
	) {
		throw new DiaryFoodNotFoundError();
	}
	return {
		operationId,
		intakeId,
		target: input.target,
		kitchenItemId,
		replayed: false,
	};
}

export async function quoteFoodLog(
	env: Env,
	principal: NutritionPrincipal,
	flags: NutritionFlagContext,
): Promise<{ credits: number }> {
	requireScope(principal, "nutrition:read");
	await assertNutritionFastLog(env, flags);
	return { credits: chargeDiaryFoodLog() };
}

export type DiaryExportRow = {
	id: string;
	manifestDate: string;
	occurredAt: string;
	slotType: string | null;
	name: string | null;
	servings: number;
	loggedAmount: number | null;
	loggedUnit: string | null;
	energyKcal: number;
	proteinG: number;
	carbsG: number;
	fatG: number;
	fiberG: number | null;
	compositionSource: string | null;
	compositionConfirmedAt: string | null;
	healthSyncId: string | null;
	healthSyncVersion: number | null;
	notes: string | null;
	organizationName: string | null;
	voidedAt: string | null;
	entryId: string | null;
};

export async function exportDiaryFood(
	env: Env,
	principal: NutritionPrincipal,
	flags: NutritionFlagContext,
): Promise<{ exportedAt: string; intakes: DiaryExportRow[] }> {
	requireScope(principal, "nutrition:read");
	await assertNutritionFastLog(env, flags);
	await assertActiveNutritionConsent(env.DB, principal.userId, "intake");
	const db = drizzle(env.DB, { schema });
	const rows = await db
		.select()
		.from(schema.nutritionIntake)
		.where(eq(schema.nutritionIntake.userId, principal.userId))
		.orderBy(schema.nutritionIntake.occurredAt);
	return {
		exportedAt: new Date().toISOString(),
		intakes: rows.map((row) => ({
			id: row.id,
			manifestDate: row.manifestDate,
			occurredAt: row.occurredAt.toISOString(),
			slotType: row.slotType,
			name: row.mealNameSnapshot,
			servings: row.servings,
			loggedAmount: row.loggedAmount,
			loggedUnit: row.loggedUnit,
			energyKcal: row.energyKcal,
			proteinG: row.proteinG,
			carbsG: row.carbsG,
			fatG: row.fatG,
			fiberG: row.fiberG,
			compositionSource: row.compositionSource,
			compositionConfirmedAt: row.compositionConfirmedAt
				? row.compositionConfirmedAt.toISOString()
				: null,
			healthSyncId: row.healthSyncId,
			healthSyncVersion: row.healthSyncVersion,
			notes: row.notes,
			organizationName: row.organizationNameSnapshot,
			voidedAt: row.voidedAt ? row.voidedAt.toISOString() : null,
			entryId: row.entryId,
		})),
	};
}

export async function countDiarySideEffects(
	db: D1Database,
	organizationId: string,
): Promise<{
	cargo: number;
	cargoQuantity: number | null;
	planEntries: number;
}> {
	const cargo = await db
		.prepare(
			"select count(*) as n, sum(quantity) as quantity from cargo where organization_id = ?",
		)
		.bind(organizationId)
		.first<{ n: number; quantity: number | null }>();
	const plans = await db
		.prepare(
			"select count(*) as n from meal_plan_entry where plan_id in (select id from meal_plan where organization_id = ?)",
		)
		.bind(organizationId)
		.first<{ n: number }>();
	return {
		cargo: cargo?.n ?? 0,
		cargoQuantity: cargo?.quantity ?? null,
		planEntries: plans?.n ?? 0,
	};
}
