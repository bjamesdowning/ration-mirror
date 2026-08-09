import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "~/db/schema";
import { assertFeatureEnabled } from "~/lib/feature-flags/assert-enabled.server";
import type { FlagshipEvaluationContext } from "~/lib/feature-flags/context.server";
import { isFeatureEnabled } from "~/lib/feature-flags/flags.server";
import type { MealPlanEntryWithMeal } from "~/lib/manifest.server";
import {
	assertActiveNutritionConsent,
	getNutritionConsentStatus,
	type NutritionConsentSource,
} from "~/lib/nutrition/consent.server";
import { NUTRITION_COVERAGE_THRESHOLD } from "~/lib/nutrition/constants";
import { previousUtcCalendarDay } from "~/lib/nutrition/goal-effective";
import {
	getActiveNutritionGoal,
	getActivePersonalIntakesForEntries,
	listNutritionIntakesForRange,
	type NutritionSummaryResult,
	getNutritionSummary as readNutritionSummary,
} from "~/lib/nutrition/persist.server";
import {
	scaleNutrientValues,
	toNullableNutrientValues,
} from "~/lib/nutrition/scale-nutrients";
import type { MealNutritionSnapshot } from "~/lib/nutrition/types";
import { UNDO_TOKEN_TTL_SECONDS } from "~/lib/undo-token.server";

export const MAX_NUTRITION_OPERATION_ITEMS = 50;

export type NutritionSurface = "web" | "mobile" | "mcp" | "copilot";

export type NutritionPrincipal = {
	userId: string;
	organizationId: string;
	surface: NutritionSurface;
	authMethod: string;
	credentialId?: string | null;
	clientId?: string | null;
	scopes?: readonly string[];
	requestId?: string;
};

export type NutritionFlagContext = FlagshipEvaluationContext;

export class NutritionOperationConflictError extends Error {
	readonly code = "idempotency_conflict" as const;
	readonly status = 409;

	constructor(
		message = "This operation key has already been used for a different request",
	) {
		super(message);
		this.name = "NutritionOperationConflictError";
	}
}

export class NutritionUnavailableError extends Error {
	readonly code = "nutrition_unavailable" as const;

	constructor(message = "Meal nutrition is unavailable for this entry") {
		super(message);
		this.name = "NutritionUnavailableError";
	}
}

/** Meal nutrition snapshot is stale/pending async recompute — do not log obsolete totals. */
export class NutritionUpdatingError extends Error {
	readonly code = "nutrition_updating" as const;
	readonly status = 409;
	readonly retryable = true;

	constructor(
		message = "Meal nutrition is still updating — try again in a moment",
	) {
		super(message);
		this.name = "NutritionUpdatingError";
	}
}

export class ManifestEntryNotPreparedError extends Error {
	readonly code = "entry_not_prepared" as const;

	constructor(message = "Entry must be cooked before logging a serving") {
		super(message);
		this.name = "ManifestEntryNotPreparedError";
	}
}

export class NutritionOperationInProgressError extends Error {
	readonly code = "operation_in_progress" as const;
	readonly status = 409;
	readonly retryable = true;

	constructor() {
		super("This nutrition operation is still in progress");
		this.name = "NutritionOperationInProgressError";
	}
}

export class NutritionItemConflictError extends Error {
	readonly code = "idempotency_conflict" as const;
	readonly status = 409;

	constructor(message = "An item idempotency key conflicts with prior input") {
		super(message);
		this.name = "NutritionItemConflictError";
	}
}

export class ConcurrentNutritionWriteError extends Error {
	readonly code = "nutrition_write_conflict" as const;
	readonly status = 409;
	readonly retryable = true;

	constructor() {
		super("A concurrent nutrition write won; retry this operation key");
		this.name = "ConcurrentNutritionWriteError";
	}
}

export class ManifestIntakeTargetNotFoundError extends Error {
	readonly code = "not_found" as const;
	readonly status = 404;

	constructor() {
		super("Manifest intake target not found");
		this.name = "ManifestIntakeTargetNotFoundError";
	}
}

export class NutritionPersistenceInvariantError extends Error {
	readonly code = "nutrition_persistence_invariant" as const;
	readonly status = 500;

	constructor() {
		super("Nutrition persistence schema or statement invariant failed");
		this.name = "NutritionPersistenceInvariantError";
	}
}

export class NutritionOperationValidationError extends Error {
	readonly code = "nutrition_operation_invalid" as const;
	readonly status = 400;

	constructor(message: string) {
		super(message);
		this.name = "NutritionOperationValidationError";
	}
}

export class NutritionScopeError extends Error {
	readonly code = "insufficient_scope" as const;
	readonly status = 403;

	constructor(readonly requiredScope: "nutrition:read" | "nutrition:write") {
		super(`Missing required scope: ${requiredScope}`);
		this.name = "NutritionScopeError";
	}
}

export class NutritionUndoUnavailableError extends Error {
	readonly code = "undo_conflict" as const;
	readonly status = 409;

	constructor(
		message = "Nutrition undo is stale or conflicts with newer intake",
		readonly fallbackAllowed = false,
	) {
		super(message);
		this.name = "NutritionUndoUnavailableError";
	}
}

type IntakeRow = typeof schema.nutritionIntake.$inferSelect;
type OperationRow = typeof schema.nutritionOperation.$inferSelect;

export type NutritionIntakeResult = {
	intake: IntakeRow;
	replacedIntakeId: string | null;
	replayed: boolean;
};

export type NutritionDayTotals = Omit<
	NutritionSummaryResult["days"][number],
	"fiberG"
> & { fiberG?: number | null };

export type LogManifestIntakesResult = {
	operationId: string;
	replayed: boolean;
	undoExpiresAt: Date | null;
	summaryGeneratedAt: string;
	items: NutritionIntakeResult[];
	dayTotals: NutritionDayTotals[];
};

export type ClearManifestIntakesResult = {
	operationId: string;
	replayed: boolean;
	undoExpiresAt: Date | null;
	summaryGeneratedAt: string;
	items: Array<{
		entryId: string;
		voidedIntakeId: string | null;
		replayed: boolean;
	}>;
	dayTotals: NutritionDayTotals[];
};

export type SetNutritionGoalInput = {
	operationKey: string;
	dailyEnergyKcal: number | null;
	proteinG: number | null;
	carbsG: number | null;
	fatG: number | null;
	fiberG: number | null;
	effectiveFrom: string;
};

function requireScope(
	principal: NutritionPrincipal,
	requiredScope: "nutrition:read" | "nutrition:write",
): void {
	if (principal.scopes && !principal.scopes.includes(requiredScope)) {
		throw new NutritionScopeError(requiredScope);
	}
}

function consentSource(surface: NutritionSurface): NutritionConsentSource {
	return surface;
}

async function assertAgentProcessingConsent(
	db: D1Database,
	principal: NutritionPrincipal,
): Promise<void> {
	if (principal.surface === "mcp" || principal.surface === "copilot") {
		await assertActiveNutritionConsent(
			db,
			principal.userId,
			"agent_processing",
		);
	}
}

function stableValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(stableValue);
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>)
				.sort(([left], [right]) => left.localeCompare(right))
				.map(([key, child]) => [key, stableValue(child)]),
		);
	}
	return value;
}

function errorIncludes(error: unknown, ...needles: string[]): boolean {
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
	const text = messages.join("\n").toLowerCase();
	return needles.some((needle) => text.includes(needle.toLowerCase()));
}

function assertNoPersistenceInvariantError(error: unknown): void {
	if (
		errorIncludes(
			error,
			"SQLITE_RANGE",
			"too many bound parameters",
			"no such table",
			"no such column",
			"has no column named",
		)
	) {
		throw new NutritionPersistenceInvariantError();
	}
}

export function canonicalNutritionRequest(value: unknown): string {
	return JSON.stringify(stableValue(value));
}

export async function hashNutritionRequest(value: unknown): Promise<string> {
	const bytes = new TextEncoder().encode(canonicalNutritionRequest(value));
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return Array.from(new Uint8Array(digest), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
}

export async function deriveNutritionOperationKey(
	itemKeys: readonly string[],
): Promise<string> {
	const digest = await hashNutritionRequest({
		itemKeys: [...itemKeys].sort(),
	});
	return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(
		13,
		16,
	)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

function assertOperationItems(
	items: readonly { entryId: string; idempotencyKey?: string }[],
	requireItemKeys: boolean,
): void {
	if (items.length === 0 || items.length > MAX_NUTRITION_OPERATION_ITEMS) {
		throw new NutritionOperationValidationError(
			`Nutrition operations require 1-${MAX_NUTRITION_OPERATION_ITEMS} items`,
		);
	}
	const entryIds = new Set<string>();
	const itemKeys = new Set<string>();
	for (const item of items) {
		if (entryIds.has(item.entryId)) {
			throw new NutritionOperationValidationError(
				`Duplicate entryId in operation: ${item.entryId}`,
			);
		}
		entryIds.add(item.entryId);
		if (requireItemKeys && !item.idempotencyKey) {
			throw new NutritionOperationValidationError(
				"Each nutrition intake item requires an idempotency key",
			);
		}
		if (item.idempotencyKey) {
			if (itemKeys.has(item.idempotencyKey)) {
				throw new NutritionOperationValidationError(
					`Duplicate item idempotency key: ${item.idempotencyKey}`,
				);
			}
			itemKeys.add(item.idempotencyKey);
		}
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

export function resolveHttpOperationKey(
	headers: Headers,
	compatibilityKey: string | null | undefined,
): string {
	const headerKey = headers.get("Idempotency-Key");
	if (headerKey && compatibilityKey && headerKey !== compatibilityKey) {
		throw new NutritionOperationValidationError(
			"Idempotency-Key must equal operationKey/body key when both are provided",
		);
	}
	const operationKey = headerKey ?? compatibilityKey;
	if (!operationKey) {
		throw new NutritionOperationValidationError(
			"Idempotency-Key or operationKey is required",
		);
	}
	assertOperationKey(operationKey);
	return operationKey;
}

async function loadOperation(
	db: ReturnType<typeof drizzle>,
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
	if (
		operation &&
		operation.organizationId !== principal.organizationId &&
		["log_manifest_intakes", "clear_manifest_intakes"].includes(
			operation.operationType,
		)
	) {
		// Intake ops are org-bound; reusing the key in another household is a conflict.
		throw new NutritionOperationConflictError();
	}
	return operation ?? null;
}

async function loadOperationById(
	db: ReturnType<typeof drizzle>,
	principal: NutritionPrincipal,
	operationId: string,
): Promise<OperationRow | null> {
	const [operation] = await db
		.select()
		.from(schema.nutritionOperation)
		.where(
			and(
				eq(schema.nutritionOperation.id, operationId),
				eq(schema.nutritionOperation.userId, principal.userId),
				eq(schema.nutritionOperation.organizationId, principal.organizationId),
			),
		)
		.limit(1);
	return operation ?? null;
}

function verifyOperation(
	operation: OperationRow,
	requestHash: string,
	operationType: string,
	itemCount: number,
): void {
	if (
		operation.requestHash !== requestHash ||
		operation.operationType !== operationType ||
		operation.itemCount !== itemCount
	) {
		throw new NutritionOperationConflictError();
	}
	if (operation.status !== "completed") {
		throw new NutritionOperationInProgressError();
	}
}

function itemCountBucket(itemCount: number): string {
	if (itemCount === 1) return "1";
	if (itemCount <= 5) return "2-5";
	if (itemCount <= 20) return "6-20";
	return "21-50";
}

function successAudit(
	principal: NutritionPrincipal,
	input: {
		eventType: string;
		requiredScope: "nutrition:read" | "nutrition:write";
		consentPurpose: "goals" | "intake";
		consentPolicyVersion: string;
		requestId: string;
		operationId: string;
		itemCount: number;
		replayed?: boolean;
	},
): typeof schema.nutritionAccessAudit.$inferInsert {
	return {
		id: crypto.randomUUID(),
		userId: principal.userId,
		organizationId: principal.organizationId,
		surface: principal.surface,
		authMethod: principal.authMethod,
		credentialId: principal.credentialId ?? null,
		clientId: principal.clientId ?? null,
		eventType: input.eventType,
		requiredScope: input.requiredScope,
		consentPurpose: input.consentPurpose,
		consentPolicyVersion: input.consentPolicyVersion,
		outcome: "success",
		replayed: input.replayed ?? false,
		itemCountBucket: itemCountBucket(input.itemCount),
		requestId: principal.requestId ?? input.requestId,
		operationId: input.operationId,
	};
}

async function auditAgentNutritionRead(
	env: Env,
	principal: NutritionPrincipal,
	input: {
		eventType: string;
		consentPurpose: "goals" | "intake";
		consentPolicyVersion: string;
		requestId: string;
		itemCount?: number;
		dateRangeBucket?: string;
	},
): Promise<void> {
	if (principal.surface !== "mcp" && principal.surface !== "copilot") {
		return;
	}
	try {
		const db = drizzle(env.DB, { schema });
		await db.insert(schema.nutritionAccessAudit).values({
			...successAudit(principal, {
				eventType: input.eventType,
				requiredScope: "nutrition:read",
				consentPurpose: input.consentPurpose,
				consentPolicyVersion: input.consentPolicyVersion,
				requestId: input.requestId,
				operationId: input.requestId,
				itemCount: input.itemCount ?? 1,
			}),
			dateRangeBucket: input.dateRangeBucket ?? null,
		});
	} catch {
		throw new NutritionPersistenceInvariantError();
	}
}

export function buildNutritionOperationResultJson(
	principal: NutritionPrincipal,
	dates: Iterable<string>,
	summaryGeneratedAt: string,
) {
	const uniqueDates = [...new Set(dates)].sort();
	if (uniqueDates.length === 0) {
		return { dayTotals: [], summaryGeneratedAt };
	}
	const dateRows = sql.join(
		uniqueDates.map((date) => sql`select ${date} as date`),
		sql` union all `,
	);
	const knownFiber = sql`coalesce(${schema.nutritionIntake.fiberG}, json_extract(${schema.nutritionIntake.nutrientsJson}, '$.fiberG'))`;
	return sql`json_object(
		'summaryGeneratedAt', ${summaryGeneratedAt},
		'dayTotals',
		json(coalesce((
			select json_group_array(json(day_json))
			from (
				select json_object(
					'date', dates.date,
					'energyKcal', coalesce(sum(${schema.nutritionIntake.energyKcal}), 0),
					'proteinG', coalesce(sum(${schema.nutritionIntake.proteinG}), 0),
					'carbsG', coalesce(sum(${schema.nutritionIntake.carbsG}), 0),
					'fatG', coalesce(sum(${schema.nutritionIntake.fatG}), 0),
					'fiberG', case
						when count(${knownFiber}) > 0 then sum(${knownFiber})
						else null
					end,
					'coverageAvg', coalesce(avg(${schema.nutritionIntake.coverage}), 0),
					'entryCount', count(${schema.nutritionIntake.id})
				) as day_json
				from (${dateRows}) as dates
				left join ${schema.nutritionIntake}
					on ${schema.nutritionIntake.manifestDate} = dates.date
					and ${schema.nutritionIntake.userId} = ${principal.userId}
					and ${schema.nutritionIntake.organizationId} = ${principal.organizationId}
					and ${schema.nutritionIntake.voidedAt} is null
				group by dates.date
				order by dates.date
			)
		), '[]'))
	)`;
}

function committedDayTotals(
	operation: OperationRow,
): NutritionDayTotals[] | null {
	const totals = operation.resultJson?.dayTotals;
	return Array.isArray(totals) ? totals : null;
}

function committedSummaryGeneratedAt(operation: OperationRow): string {
	return (
		operation.resultJson?.summaryGeneratedAt ??
		(operation.completedAt ?? operation.createdAt).toISOString()
	);
}

function undoExpiresAt(operation: OperationRow): Date | null {
	if (operation.undoneAt) return null;
	const committedAt = operation.completedAt ?? operation.createdAt;
	return new Date(committedAt.getTime() + UNDO_TOKEN_TTL_SECONDS * 1_000);
}

async function loadEntries(
	db: ReturnType<typeof drizzle>,
	principal: NutritionPrincipal,
	planId: string,
	entryIds: string[],
) {
	const rows = await db
		.select({
			id: schema.mealPlanEntry.id,
			mealId: schema.mealPlanEntry.mealId,
			date: schema.mealPlanEntry.date,
			slotType: schema.mealPlanEntry.slotType,
			cookedAt: schema.mealPlanEntry.cookedAt,
			consumedAt: schema.mealPlanEntry.consumedAt,
			mealNutrition: schema.meal.nutrition,
			nutritionStatus: schema.meal.nutritionStatus,
			nutritionRevision: schema.meal.nutritionRevision,
			nutritionComputedRevision: schema.meal.nutritionComputedRevision,
		})
		.from(schema.mealPlanEntry)
		.innerJoin(
			schema.mealPlan,
			eq(schema.mealPlanEntry.planId, schema.mealPlan.id),
		)
		.innerJoin(schema.meal, eq(schema.mealPlanEntry.mealId, schema.meal.id))
		.where(
			and(
				eq(schema.mealPlan.id, planId),
				eq(schema.mealPlan.organizationId, principal.organizationId),
				eq(schema.meal.organizationId, principal.organizationId),
				inArray(schema.mealPlanEntry.id, entryIds),
			),
		);
	if (rows.length !== entryIds.length) {
		throw new ManifestIntakeTargetNotFoundError();
	}
	return new Map(rows.map((row) => [row.id, row]));
}

async function loadRowsByItemKeys(
	db: ReturnType<typeof drizzle>,
	principal: NutritionPrincipal,
	keys: string[],
): Promise<Map<string, IntakeRow>> {
	if (keys.length === 0) return new Map();
	const rows = await db
		.select()
		.from(schema.nutritionIntake)
		.where(
			and(
				eq(schema.nutritionIntake.userId, principal.userId),
				eq(schema.nutritionIntake.organizationId, principal.organizationId),
				inArray(schema.nutritionIntake.idempotencyKey, keys),
			),
		);
	return new Map(
		rows
			.filter(
				(row): row is IntakeRow & { idempotencyKey: string } =>
					row.idempotencyKey != null,
			)
			.map((row) => [row.idempotencyKey, row]),
	);
}

async function loadActiveRows(
	db: ReturnType<typeof drizzle>,
	principal: NutritionPrincipal,
	entryIds: string[],
): Promise<Map<string, IntakeRow>> {
	const rows = await db
		.select()
		.from(schema.nutritionIntake)
		.where(
			and(
				eq(schema.nutritionIntake.userId, principal.userId),
				eq(schema.nutritionIntake.organizationId, principal.organizationId),
				inArray(schema.nutritionIntake.entryId, entryIds),
				isNull(schema.nutritionIntake.voidedAt),
			),
		);
	return new Map(
		rows
			.filter(
				(row): row is IntakeRow & { entryId: string } => row.entryId != null,
			)
			.map((row) => [row.entryId, row]),
	);
}

async function dayTotalsForDates(
	db: D1Database,
	principal: NutritionPrincipal,
	dates: Iterable<string>,
): Promise<NutritionDayTotals[]> {
	const uniqueDates = [...new Set(dates)].sort();
	if (uniqueDates.length === 0) return [];
	const firstDate = uniqueDates[0];
	const lastDate = uniqueDates.at(-1);
	if (!firstDate || !lastDate) return [];
	const summary = await readNutritionSummary(
		db,
		principal.userId,
		principal.organizationId,
		firstDate,
		lastDate,
	);
	const expected = new Set(uniqueDates);
	const byDate = new Map(summary.days.map((day) => [day.date, day]));
	return uniqueDates
		.map(
			(date) =>
				byDate.get(date) ?? {
					date,
					energyKcal: 0,
					proteinG: 0,
					carbsG: 0,
					fatG: 0,
					coverageAvg: 0,
					entryCount: 0,
				},
		)
		.filter((day) => expected.has(day.date));
}

async function reconstructLogResult(
	env: Env,
	principal: NutritionPrincipal,
	operation: OperationRow,
	items: readonly {
		entryId: string;
		servings: number;
		idempotencyKey: string;
	}[],
): Promise<LogManifestIntakesResult> {
	const db = drizzle(env.DB, { schema });
	const byKey = await loadRowsByItemKeys(
		db,
		principal,
		items.map((item) => item.idempotencyKey),
	);
	const results = items.map((item) => {
		const row = byKey.get(item.idempotencyKey);
		if (
			!row ||
			row.organizationId !== principal.organizationId ||
			row.entryId !== item.entryId ||
			row.servings !== item.servings
		) {
			throw new NutritionItemConflictError(
				"Unable to reconstruct the completed operation from its item keys",
			);
		}
		return {
			intake: row,
			replacedIntakeId: row.replacesIntakeId,
			replayed: true,
		};
	});
	return {
		operationId: operation.id,
		replayed: true,
		summaryGeneratedAt: committedSummaryGeneratedAt(operation),
		undoExpiresAt: results.some(
			(result) => result.intake.operationId === operation.id,
		)
			? undoExpiresAt(operation)
			: null,
		items: results,
		dayTotals:
			committedDayTotals(operation) ??
			(await dayTotalsForDates(
				env.DB,
				principal,
				results.map((result) => result.intake.manifestDate),
			)),
	};
}

export async function logManifestIntakes(
	env: Env,
	principal: NutritionPrincipal,
	flags: NutritionFlagContext,
	input: {
		operationKey: string;
		planId: string;
		items: Array<{
			entryId: string;
			servings: number;
			idempotencyKey: string;
			occurredAt?: Date;
		}>;
	},
): Promise<LogManifestIntakesResult> {
	requireScope(principal, "nutrition:write");
	assertOperationKey(input.operationKey);
	assertOperationItems(input.items, true);
	await assertFeatureEnabled(env, "nutrition-cook-log-split", flags);
	await assertFeatureEnabled(env, "nutrition-manifest", flags);
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

	const canonicalInput = {
		operationType: "log_manifest_intakes",
		planId: input.planId,
		items: [...input.items]
			.map((item) => ({
				entryId: item.entryId,
				servings: item.servings,
				idempotencyKey: item.idempotencyKey,
				occurredAt: item.occurredAt?.toISOString() ?? null,
			}))
			.sort((left, right) => left.entryId.localeCompare(right.entryId)),
	};
	const requestHash = await hashNutritionRequest(canonicalInput);
	const db = drizzle(env.DB, { schema });
	const existingOperation = await loadOperation(
		db,
		principal,
		input.operationKey,
	);
	if (existingOperation) {
		verifyOperation(
			existingOperation,
			requestHash,
			"log_manifest_intakes",
			input.items.length,
		);
		return reconstructLogResult(env, principal, existingOperation, input.items);
	}

	const entries = await loadEntries(
		db,
		principal,
		input.planId,
		input.items.map((item) => item.entryId),
	);
	for (const item of input.items) {
		const entry = entries.get(item.entryId);
		if (!entry) throw new ManifestIntakeTargetNotFoundError();
		if (entry.cookedAt == null && entry.consumedAt == null) {
			throw new ManifestEntryNotPreparedError();
		}
		if (
			!Number.isFinite(item.servings) ||
			item.servings < 0.5 ||
			item.servings > 100
		) {
			throw new NutritionOperationValidationError(
				"Servings must be between 0.5 and 100",
			);
		}
	}

	const operationId = crypto.randomUUID();
	const committedAt = new Date();
	const stableIntakeIds = new Map(
		input.items.map((item) => [item.idempotencyKey, crypto.randomUUID()]),
	);

	for (let attempt = 0; attempt < 3; attempt += 1) {
		const byKey = await loadRowsByItemKeys(
			db,
			principal,
			input.items.map((item) => item.idempotencyKey),
		);
		for (const item of input.items) {
			const row = byKey.get(item.idempotencyKey);
			if (
				row &&
				(row.entryId !== item.entryId ||
					row.servings !== item.servings ||
					(item.occurredAt != null &&
						row.occurredAt.getTime() !== item.occurredAt.getTime()))
			) {
				throw new NutritionItemConflictError();
			}
		}
		const activeByEntry = await loadActiveRows(
			db,
			principal,
			input.items.map((item) => item.entryId),
		);
		const newRows: Array<typeof schema.nutritionIntake.$inferInsert> = [];
		const results: NutritionIntakeResult[] = [];
		for (const item of input.items) {
			const replayedRow = byKey.get(item.idempotencyKey);
			if (replayedRow) {
				results.push({
					intake: replayedRow,
					replacedIntakeId: replayedRow.replacesIntakeId,
					replayed: true,
				});
				continue;
			}
			const entry = entries.get(item.entryId);
			if (!entry) throw new ManifestIntakeTargetNotFoundError();
			if (
				entry.nutritionStatus === "pending" ||
				entry.nutritionStatus === "failed" ||
				entry.nutritionComputedRevision < entry.nutritionRevision
			) {
				throw new NutritionUpdatingError();
			}
			const snapshot = entry.mealNutrition as MealNutritionSnapshot | null;
			const perServing = snapshot?.perServing;
			if (
				!perServing ||
				perServing.energyKcal == null ||
				!Number.isFinite(perServing.energyKcal)
			) {
				throw new NutritionUnavailableError();
			}
			const scaled = scaleNutrientValues(perServing, item.servings);
			const coverage = snapshot?.coverage ?? 0;
			const prior = activeByEntry.get(item.entryId);
			const intakeId = stableIntakeIds.get(item.idempotencyKey);
			if (!intakeId) {
				throw new Error("Stable nutrition intake ID was not precomputed");
			}
			const row: IntakeRow = {
				id: intakeId,
				organizationId: principal.organizationId,
				userId: principal.userId,
				planId: input.planId,
				entryId: item.entryId,
				mealId: entry.mealId,
				manifestDate: entry.date,
				slotType: entry.slotType ?? null,
				servings: item.servings,
				energyKcal: scaled.energyKcal,
				proteinG: scaled.proteinG,
				carbsG: scaled.carbG,
				fatG: scaled.fatG,
				fiberG: scaled.fiberG,
				coverage,
				source: "meal",
				confidence: coverage,
				verified: coverage >= NUTRITION_COVERAGE_THRESHOLD ? 1 : 0,
				occurredAt: item.occurredAt ?? committedAt,
				kitchenEventId: null,
				schemaVersion: 2,
				nutrientsJson: toNullableNutrientValues(scaled) as Record<
					string,
					number | null
				>,
				coverageJson: { overall: coverage },
				consentId: intakeConsent.id,
				idempotencyKey: item.idempotencyKey,
				operationId,
				replacesIntakeId: prior?.id ?? null,
				voidOperationId: null,
				voidedAt: null,
				voidedByUserId: null,
				createdAt: committedAt,
			};
			newRows.push(row);
			results.push({
				intake: row,
				replacedIntakeId: prior?.id ?? null,
				replayed: false,
			});
		}

		// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch statement types are heterogeneous.
		const statements: any[] = [
			db.insert(schema.nutritionOperation).values({
				id: operationId,
				userId: principal.userId,
				organizationId: principal.organizationId,
				operationKey: input.operationKey,
				requestHash,
				operationType: "log_manifest_intakes",
				status: "in_progress",
				itemCount: input.items.length,
				createdAt: committedAt,
			}),
		];
		// One void UPDATE for all replaced rows (keeps batch under D1 statement limits).
		const replaceIds = newRows
			.map((row) => row.replacesIntakeId)
			.filter((id): id is string => id != null);
		if (replaceIds.length > 0) {
			statements.push(
				db
					.update(schema.nutritionIntake)
					.set({
						voidedAt: committedAt,
						voidedByUserId: principal.userId,
						voidOperationId: operationId,
					})
					.where(
						and(
							inArray(schema.nutritionIntake.id, replaceIds),
							eq(schema.nutritionIntake.userId, principal.userId),
							eq(
								schema.nutritionIntake.organizationId,
								principal.organizationId,
							),
							isNull(schema.nutritionIntake.voidedAt),
						),
					),
			);
		}
		for (const row of newRows) {
			// One row per statement keeps every insert far below D1's bind ceiling.
			statements.push(db.insert(schema.nutritionIntake).values(row));
		}
		statements.push(
			db
				.update(schema.nutritionOperation)
				.set({
					status: "completed",
					completedAt: committedAt,
					resultJson: buildNutritionOperationResultJson(
						principal,
						results.map((result) => result.intake.manifestDate),
						committedAt.toISOString(),
					),
				})
				.where(
					and(
						eq(schema.nutritionOperation.id, operationId),
						eq(schema.nutritionOperation.status, "in_progress"),
					),
				),
			db.insert(schema.nutritionAccessAudit).values(
				successAudit(principal, {
					eventType: "nutrition_intake_write",
					requiredScope: "nutrition:write",
					consentPurpose: "intake",
					consentPolicyVersion: intakeConsent.statement.policyVersion,
					requestId: input.operationKey,
					operationId,
					itemCount: input.items.length,
				}),
			),
		);

		try {
			// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch statement types are heterogeneous.
			await db.batch(statements as [any, ...any[]]);
		} catch (error) {
			assertNoPersistenceInvariantError(error);
			const racedOperation = await loadOperation(
				db,
				principal,
				input.operationKey,
			);
			if (racedOperation) {
				verifyOperation(
					racedOperation,
					requestHash,
					"log_manifest_intakes",
					input.items.length,
				);
				return reconstructLogResult(
					env,
					principal,
					racedOperation,
					input.items,
				);
			}
			if (
				errorIncludes(
					error,
					"nutrition_intake_user_org_entry_active_uidx",
					"nutrition_intake_user_idempotency_uidx",
				)
			) {
				if (attempt < 2) {
					await new Promise((resolve) =>
						setTimeout(resolve, 5 + Math.floor(Math.random() * 16)),
					);
					continue;
				}
				throw new ConcurrentNutritionWriteError();
			}
			throw error;
		}

		const committedOperation = await loadOperation(
			db,
			principal,
			input.operationKey,
		);
		if (!committedOperation) {
			throw new Error("Completed nutrition operation could not be loaded");
		}
		const { emitNutritionIntakeLogged } = await import(
			"~/lib/telemetry.server"
		);
		emitNutritionIntakeLogged(
			"manifest",
			results.some((r) => r.replayed) && newRows.length === 0
				? "replayed"
				: "committed",
		);
		return {
			operationId,
			replayed: false,
			summaryGeneratedAt: committedSummaryGeneratedAt(committedOperation),
			undoExpiresAt:
				newRows.length > 0 ? undoExpiresAt(committedOperation) : null,
			items: results,
			dayTotals:
				committedDayTotals(committedOperation) ??
				(await dayTotalsForDates(
					env.DB,
					principal,
					results.map((result) => result.intake.manifestDate),
				)),
		};
	}
	throw new ConcurrentNutritionWriteError();
}

async function reconstructClearResult(
	env: Env,
	principal: NutritionPrincipal,
	operation: OperationRow,
	entryIds: string[],
): Promise<ClearManifestIntakesResult> {
	const db = drizzle(env.DB, { schema });
	const rows = await db
		.select()
		.from(schema.nutritionIntake)
		.where(
			and(
				eq(schema.nutritionIntake.userId, principal.userId),
				eq(schema.nutritionIntake.organizationId, principal.organizationId),
				eq(schema.nutritionIntake.voidOperationId, operation.id),
				inArray(schema.nutritionIntake.entryId, entryIds),
			),
		);
	const byEntry = new Map(
		rows
			.filter(
				(row): row is IntakeRow & { entryId: string } => row.entryId != null,
			)
			.map((row) => [row.entryId, row]),
	);
	return {
		operationId: operation.id,
		replayed: true,
		summaryGeneratedAt: committedSummaryGeneratedAt(operation),
		undoExpiresAt: byEntry.size > 0 ? undoExpiresAt(operation) : null,
		items: entryIds.map((entryId) => ({
			entryId,
			voidedIntakeId: byEntry.get(entryId)?.id ?? null,
			replayed: true,
		})),
		dayTotals:
			committedDayTotals(operation) ??
			(await dayTotalsForDates(
				env.DB,
				principal,
				rows.map((row) => row.manifestDate),
			)),
	};
}

export async function clearManifestIntakes(
	env: Env,
	principal: NutritionPrincipal,
	flags: NutritionFlagContext,
	input: {
		operationKey: string;
		planId: string;
		entryIds: string[];
	},
): Promise<ClearManifestIntakesResult> {
	requireScope(principal, "nutrition:write");
	assertOperationKey(input.operationKey);
	assertOperationItems(
		input.entryIds.map((entryId) => ({ entryId })),
		false,
	);
	await assertFeatureEnabled(env, "nutrition-cook-log-split", flags);
	await assertFeatureEnabled(env, "nutrition-manifest", flags);
	let consentPolicyVersion = "not_required";
	if (principal.surface === "mcp" || principal.surface === "copilot") {
		await assertAgentProcessingConsent(env.DB, principal);
		const intakeConsent = await assertActiveNutritionConsent(
			env.DB,
			principal.userId,
			"intake",
		);
		consentPolicyVersion = intakeConsent.statement.policyVersion;
	}
	const canonicalInput = {
		operationType: "clear_manifest_intakes",
		planId: input.planId,
		entryIds: [...input.entryIds].sort(),
	};
	const requestHash = await hashNutritionRequest(canonicalInput);
	const db = drizzle(env.DB, { schema });
	const existingOperation = await loadOperation(
		db,
		principal,
		input.operationKey,
	);
	if (existingOperation) {
		verifyOperation(
			existingOperation,
			requestHash,
			"clear_manifest_intakes",
			input.entryIds.length,
		);
		return reconstructClearResult(
			env,
			principal,
			existingOperation,
			input.entryIds,
		);
	}
	const entries = await loadEntries(
		db,
		principal,
		input.planId,
		input.entryIds,
	);
	if (input.entryIds.some((entryId) => !entries.has(entryId))) {
		throw new ManifestIntakeTargetNotFoundError();
	}
	const operationId = crypto.randomUUID();
	const committedAt = new Date();
	// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch statement types are heterogeneous.
	const statements: any[] = [
		db.insert(schema.nutritionOperation).values({
			id: operationId,
			userId: principal.userId,
			organizationId: principal.organizationId,
			operationKey: input.operationKey,
			requestHash,
			operationType: "clear_manifest_intakes",
			status: "in_progress",
			itemCount: input.entryIds.length,
			createdAt: committedAt,
		}),
	];
	for (const entryId of input.entryIds) {
		statements.push(
			db
				.update(schema.nutritionIntake)
				.set({
					voidedAt: committedAt,
					voidedByUserId: principal.userId,
					voidOperationId: operationId,
				})
				.where(
					and(
						eq(schema.nutritionIntake.userId, principal.userId),
						eq(schema.nutritionIntake.organizationId, principal.organizationId),
						eq(schema.nutritionIntake.entryId, entryId),
						isNull(schema.nutritionIntake.voidedAt),
					),
				),
		);
	}
	statements.push(
		db
			.update(schema.nutritionOperation)
			.set({
				status: "completed",
				completedAt: committedAt,
				resultJson: buildNutritionOperationResultJson(
					principal,
					[...entries.values()].map((entry) => entry.date),
					committedAt.toISOString(),
				),
			})
			.where(
				and(
					eq(schema.nutritionOperation.id, operationId),
					eq(schema.nutritionOperation.status, "in_progress"),
				),
			),
		db.insert(schema.nutritionAccessAudit).values(
			successAudit(principal, {
				eventType: "nutrition_intake_clear",
				requiredScope: "nutrition:write",
				consentPurpose: "intake",
				consentPolicyVersion,
				requestId: input.operationKey,
				operationId,
				itemCount: input.entryIds.length,
			}),
		),
	);
	try {
		// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch statement types are heterogeneous.
		await db.batch(statements as [any, ...any[]]);
	} catch (error) {
		assertNoPersistenceInvariantError(error);
		const racedOperation = await loadOperation(
			db,
			principal,
			input.operationKey,
		);
		if (racedOperation) {
			verifyOperation(
				racedOperation,
				requestHash,
				"clear_manifest_intakes",
				input.entryIds.length,
			);
			return reconstructClearResult(
				env,
				principal,
				racedOperation,
				input.entryIds,
			);
		}
		throw error;
	}
	const committedOperation = await loadOperation(
		db,
		principal,
		input.operationKey,
	);
	if (!committedOperation) {
		throw new Error("Completed nutrition operation could not be loaded");
	}
	const committedResult = await reconstructClearResult(
		env,
		principal,
		committedOperation,
		input.entryIds,
	);
	return {
		...committedResult,
		replayed: false,
		items: committedResult.items.map((item) => ({
			...item,
			replayed: false,
		})),
	};
}

export async function setGoal(
	env: Env,
	principal: NutritionPrincipal,
	flags: NutritionFlagContext,
	input: SetNutritionGoalInput,
) {
	requireScope(principal, "nutrition:write");
	assertOperationKey(input.operationKey);
	await assertFeatureEnabled(env, "nutrition-goals", flags);
	await assertAgentProcessingConsent(env.DB, principal);
	const consent = await assertActiveNutritionConsent(
		env.DB,
		principal.userId,
		"goals",
	);
	const requestHash = await hashNutritionRequest({
		operationType: "set_goal",
		...input,
	});
	const db = drizzle(env.DB, { schema });
	const existingOperation = await loadOperation(
		db,
		principal,
		input.operationKey,
	);
	if (existingOperation) {
		verifyOperation(existingOperation, requestHash, "set_goal", 1);
		const [goal] = await db
			.select()
			.from(schema.nutritionGoal)
			.where(eq(schema.nutritionGoal.id, existingOperation.id))
			.limit(1);
		if (!goal) {
			throw new NutritionOperationConflictError(
				"Unable to reconstruct the completed goal operation",
			);
		}
		return {
			operationId: existingOperation.id,
			replayed: true,
			goal,
		};
	}
	const operationId = crypto.randomUUID();
	const committedAt = new Date();
	const effectiveTo = previousUtcCalendarDay(input.effectiveFrom);
	if (!effectiveTo) {
		throw new NutritionOperationValidationError(
			"effectiveFrom must be a valid calendar date",
		);
	}
	for (let attempt = 0; attempt < 3; attempt += 1) {
		// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch statement types are heterogeneous.
		const statements: any[] = [
			db.insert(schema.nutritionOperation).values({
				id: operationId,
				userId: principal.userId,
				organizationId: principal.organizationId,
				operationKey: input.operationKey,
				requestHash,
				operationType: "set_goal",
				status: "in_progress",
				itemCount: 1,
				createdAt: committedAt,
			}),
			db
				.update(schema.nutritionGoal)
				.set({ effectiveTo })
				.where(
					and(
						eq(schema.nutritionGoal.userId, principal.userId),
						isNull(schema.nutritionGoal.effectiveTo),
					),
				),
			db.insert(schema.nutritionGoal).values({
				id: operationId,
				userId: principal.userId,
				dailyEnergyKcal: input.dailyEnergyKcal,
				proteinG: input.proteinG,
				carbsG: input.carbsG,
				fatG: input.fatG,
				fiberG: input.fiberG,
				effectiveFrom: input.effectiveFrom,
				effectiveTo: null,
				consentAt: consent.grantedAt,
				consentId: consent.id,
				createdAt: committedAt,
			}),
			db
				.update(schema.nutritionOperation)
				.set({ status: "completed", completedAt: committedAt })
				.where(eq(schema.nutritionOperation.id, operationId)),
			db.insert(schema.nutritionAccessAudit).values(
				successAudit(principal, {
					eventType: "nutrition_goal_write",
					requiredScope: "nutrition:write",
					consentPurpose: "goals",
					consentPolicyVersion: consent.statement.policyVersion,
					requestId: input.operationKey,
					operationId,
					itemCount: 1,
				}),
			),
		];
		try {
			// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch statement types are heterogeneous.
			await db.batch(statements as [any, ...any[]]);
		} catch (error) {
			assertNoPersistenceInvariantError(error);
			const racedOperation = await loadOperation(
				db,
				principal,
				input.operationKey,
			);
			if (racedOperation) {
				verifyOperation(racedOperation, requestHash, "set_goal", 1);
				const [goal] = await db
					.select()
					.from(schema.nutritionGoal)
					.where(eq(schema.nutritionGoal.id, racedOperation.id))
					.limit(1);
				if (goal) {
					return { operationId: racedOperation.id, replayed: true, goal };
				}
			}
			if (
				errorIncludes(error, "nutrition_goal_user_open_uidx") &&
				attempt < 2
			) {
				await new Promise((resolve) =>
					setTimeout(resolve, 5 + Math.floor(Math.random() * 16)),
				);
				continue;
			}
			if (errorIncludes(error, "nutrition_goal_user_open_uidx")) {
				throw new ConcurrentNutritionWriteError();
			}
			throw error;
		}
		const [goal] = await db
			.select()
			.from(schema.nutritionGoal)
			.where(eq(schema.nutritionGoal.id, operationId))
			.limit(1);
		if (!goal) throw new Error("Failed to create nutrition goal");
		return { operationId, replayed: false, goal };
	}
	throw new ConcurrentNutritionWriteError();
}

export async function clearGoal(
	env: Env,
	principal: NutritionPrincipal,
	flags: NutritionFlagContext,
	input: { operationKey: string; asOfDate: string },
) {
	requireScope(principal, "nutrition:write");
	assertOperationKey(input.operationKey);
	await assertFeatureEnabled(env, "nutrition-goals", flags);
	await assertAgentProcessingConsent(env.DB, principal);
	await assertActiveNutritionConsent(env.DB, principal.userId, "goals");
	const requestHash = await hashNutritionRequest({
		operationType: "clear_goal",
		...input,
	});
	const db = drizzle(env.DB, { schema });
	const existingOperation = await loadOperation(
		db,
		principal,
		input.operationKey,
	);
	if (existingOperation) {
		verifyOperation(existingOperation, requestHash, "clear_goal", 1);
		return {
			operationId: existingOperation.id,
			replayed: true,
			cleared: true,
			goal: null,
		};
	}
	const operationId = crypto.randomUUID();
	const committedAt = new Date();
	const effectiveTo = previousUtcCalendarDay(input.asOfDate);
	if (!effectiveTo) {
		throw new NutritionOperationValidationError(
			"asOfDate must be a valid calendar date",
		);
	}
	// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch statement types are heterogeneous.
	const statements: any[] = [
		db.insert(schema.nutritionOperation).values({
			id: operationId,
			userId: principal.userId,
			organizationId: principal.organizationId,
			operationKey: input.operationKey,
			requestHash,
			operationType: "clear_goal",
			status: "in_progress",
			itemCount: 1,
			createdAt: committedAt,
		}),
		db
			.update(schema.nutritionGoal)
			.set({ effectiveTo })
			.where(
				and(
					eq(schema.nutritionGoal.userId, principal.userId),
					isNull(schema.nutritionGoal.effectiveTo),
				),
			),
		db
			.update(schema.nutritionOperation)
			.set({ status: "completed", completedAt: committedAt })
			.where(eq(schema.nutritionOperation.id, operationId)),
		db.insert(schema.nutritionAccessAudit).values(
			successAudit(principal, {
				eventType: "nutrition_goal_clear",
				requiredScope: "nutrition:write",
				consentPurpose: "goals",
				consentPolicyVersion: "not_required",
				requestId: input.operationKey,
				operationId,
				itemCount: 1,
			}),
		),
	];
	try {
		// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch statement types are heterogeneous.
		await db.batch(statements as [any, ...any[]]);
	} catch (error) {
		assertNoPersistenceInvariantError(error);
		const racedOperation = await loadOperation(
			db,
			principal,
			input.operationKey,
		);
		if (racedOperation) {
			verifyOperation(racedOperation, requestHash, "clear_goal", 1);
			return {
				operationId: racedOperation.id,
				replayed: true,
				cleared: true,
				goal: null,
			};
		}
		throw error;
	}
	return {
		operationId,
		replayed: false,
		cleared: true,
		goal: null,
	};
}

export async function getGoal(
	env: Env,
	principal: NutritionPrincipal,
	flags: NutritionFlagContext,
	asOfDate: string,
) {
	requireScope(principal, "nutrition:read");
	await assertFeatureEnabled(env, "nutrition-goals", flags);
	await assertAgentProcessingConsent(env.DB, principal);
	const consent = await assertActiveNutritionConsent(
		env.DB,
		principal.userId,
		"goals",
	);
	const goal = await getActiveNutritionGoal(env.DB, principal.userId, asOfDate);
	await auditAgentNutritionRead(env, principal, {
		eventType: "nutrition_goal_read",
		consentPurpose: "goals",
		consentPolicyVersion: consent.statement.policyVersion,
		requestId: principal.requestId ?? crypto.randomUUID(),
	});
	return goal;
}

export async function getSummary(
	env: Env,
	principal: NutritionPrincipal,
	flags: NutritionFlagContext,
	from: string,
	to: string,
) {
	requireScope(principal, "nutrition:read");
	const [goalsEnabled, manifestEnabled] = await Promise.all([
		isFeatureEnabled(env, "nutrition-goals", flags),
		isFeatureEnabled(env, "nutrition-manifest", flags),
	]);
	if (!goalsEnabled && !manifestEnabled) {
		await assertFeatureEnabled(env, "nutrition-manifest", flags);
	}
	if (principal.surface === "mcp" || principal.surface === "copilot") {
		await assertAgentProcessingConsent(env.DB, principal);
		if (goalsEnabled) {
			await assertActiveNutritionConsent(env.DB, principal.userId, "goals");
		}
	}
	const intakeConsent = await assertActiveNutritionConsent(
		env.DB,
		principal.userId,
		"intake",
	);
	const goalsConsent = goalsEnabled
		? await getNutritionConsentStatus(env.DB, principal.userId, "goals")
		: null;
	const includeGoal = goalsConsent?.state === "active";
	const started = Date.now();
	const summary = await readNutritionSummary(
		env.DB,
		principal.userId,
		principal.organizationId,
		from,
		to,
	);
	const gatedSummary = includeGoal ? summary : { ...summary, goal: null };
	const { emitNutritionSummaryDuration } = await import(
		"~/lib/telemetry.server"
	);
	const elapsed = Date.now() - started;
	const bucket =
		elapsed < 50
			? "lt50"
			: elapsed < 150
				? "lt150"
				: elapsed < 500
					? "lt500"
					: "gte500";
	emitNutritionSummaryDuration(bucket);
	await auditAgentNutritionRead(env, principal, {
		eventType: "nutrition_summary_read",
		consentPurpose: "intake",
		consentPolicyVersion: intakeConsent.statement.policyVersion,
		requestId: principal.requestId ?? crypto.randomUUID(),
		dateRangeBucket: `${from}:${to}`,
		itemCount: gatedSummary.days.length,
	});
	return gatedSummary;
}

export async function getHistory(
	env: Env,
	principal: NutritionPrincipal,
	flags: NutritionFlagContext,
	from: string,
	to: string,
	options: { limit?: number; cursor?: string } = {},
) {
	requireScope(principal, "nutrition:read");
	await assertFeatureEnabled(env, "nutrition-manifest", flags);
	await assertAgentProcessingConsent(env.DB, principal);
	const intakeConsent = await assertActiveNutritionConsent(
		env.DB,
		principal.userId,
		"intake",
	);
	const history = await listNutritionIntakesForRange(
		env.DB,
		principal.userId,
		principal.organizationId,
		from,
		to,
		options,
	);
	await auditAgentNutritionRead(env, principal, {
		eventType: "nutrition_intake_read",
		consentPurpose: "intake",
		consentPolicyVersion: intakeConsent.statement.policyVersion,
		requestId: principal.requestId ?? crypto.randomUUID(),
		dateRangeBucket: `${from}:${to}`,
		itemCount: history.items.length,
	});
	return history;
}

export async function attachPersonalIntakeToEntries(
	env: Env,
	principal: NutritionPrincipal,
	flags: NutritionFlagContext,
	entries: MealPlanEntryWithMeal[],
): Promise<MealPlanEntryWithMeal[]> {
	requireScope(principal, "nutrition:read");
	if (entries.length === 0) return entries;
	await assertFeatureEnabled(env, "nutrition-manifest", flags);
	await assertAgentProcessingConsent(env.DB, principal);
	await assertActiveNutritionConsent(env.DB, principal.userId, "intake");
	const map = await getActivePersonalIntakesForEntries(
		env.DB,
		principal.userId,
		principal.organizationId,
		entries.map((entry) => entry.id),
	);
	return entries.map((entry) => {
		const intake = map.get(entry.id);
		return {
			...entry,
			personalIntake: intake
				? {
						id: intake.id,
						servings: intake.servings,
						energyKcal: intake.energyKcal,
						proteinG: intake.proteinG,
						carbsG: intake.carbsG,
						fatG: intake.fatG,
						occurredAt: intake.occurredAt,
					}
				: null,
		};
	});
}

export async function getMealNutrition(
	env: Env,
	principal: NutritionPrincipal,
	flags: NutritionFlagContext,
	mealId: string,
) {
	requireScope(principal, "nutrition:read");
	await assertFeatureEnabled(env, "nutrition-engine", flags);
	const db = drizzle(env.DB, { schema });
	const [row] = await db
		.select({ id: schema.meal.id, nutrition: schema.meal.nutrition })
		.from(schema.meal)
		.where(
			and(
				eq(schema.meal.id, mealId),
				eq(schema.meal.organizationId, principal.organizationId),
			),
		)
		.limit(1);
	return row ?? null;
}

function isNutritionOperationId(value: string): boolean {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
		value,
	);
}

/**
 * Undo a committed Eat/clear operation. When cook-log-split is off, the token is
 * not a nutrition operation id, or no operation row exists, throws
 * {@link NutritionUndoUnavailableError} with `fallbackAllowed` so `/api/undo`
 * can reverse legacy KV cook/consume tokens for App Store / flag-off clients.
 */
export async function undoIntake(
	env: Env,
	principal: NutritionPrincipal,
	flags: NutritionFlagContext,
	operationId: string,
): Promise<{
	operationId: string;
	undone: true;
	replayed: boolean;
	summaryGeneratedAt: string;
	dayTotals: NutritionDayTotals[];
}> {
	requireScope(principal, "nutrition:write");
	const cookLogSplitOn = await isFeatureEnabled(
		env,
		"nutrition-cook-log-split",
		flags,
	);
	if (!cookLogSplitOn) {
		throw new NutritionUndoUnavailableError(
			"Nutrition undo unavailable while cook-log-split is off",
			true,
		);
	}
	// Soft-validate: KV cook/consume tokens are UUIDs too, but may not be ops.
	if (!isNutritionOperationId(operationId)) {
		throw new NutritionUndoUnavailableError(
			"Token is not a nutrition operation id",
			true,
		);
	}
	const db = drizzle(env.DB, { schema });
	const operation = await loadOperationById(db, principal, operationId);
	if (!operation) {
		throw new NutritionUndoUnavailableError(
			"Nutrition undo operation was not found",
			true,
		);
	}
	// Consent only after we know this is a nutrition intake/clear operation —
	// never block legacy cook/consume KV undo for users without intake consent.
	await assertAgentProcessingConsent(env.DB, principal);
	const intakeConsent = await assertActiveNutritionConsent(
		env.DB,
		principal.userId,
		"intake",
	);
	if (
		!["log_manifest_intakes", "clear_manifest_intakes"].includes(
			operation.operationType,
		) ||
		operation.status !== "completed"
	) {
		throw new NutritionUndoUnavailableError();
	}
	const operationDates =
		operation.resultJson?.dayTotals?.map((day) => day.date) ?? [];
	if (operation.undoneAt) {
		return {
			operationId,
			undone: true,
			replayed: true,
			summaryGeneratedAt: operation.undoneAt.toISOString(),
			dayTotals: await dayTotalsForDates(env.DB, principal, operationDates),
		};
	}
	const completedAt = operation.completedAt ?? operation.createdAt;
	if (Date.now() - completedAt.getTime() > UNDO_TOKEN_TTL_SECONDS * 1_000) {
		throw new NutritionUndoUnavailableError();
	}
	const undoneAtSec = Math.floor(Date.now() / 1000);
	const now = new Date(undoneAtSec * 1000);
	const rows =
		operation.operationType === "log_manifest_intakes"
			? await db
					.select()
					.from(schema.nutritionIntake)
					.where(
						and(
							eq(schema.nutritionIntake.userId, principal.userId),
							eq(
								schema.nutritionIntake.organizationId,
								principal.organizationId,
							),
							eq(schema.nutritionIntake.operationId, operationId),
						),
					)
			: await db
					.select()
					.from(schema.nutritionIntake)
					.where(
						and(
							eq(schema.nutritionIntake.userId, principal.userId),
							eq(
								schema.nutritionIntake.organizationId,
								principal.organizationId,
							),
							eq(schema.nutritionIntake.voidOperationId, operationId),
						),
					);
	const dates =
		rows.length > 0 ? rows.map((row) => row.manifestDate) : operationDates;
	if (rows.length === 0) {
		throw new NutritionUndoUnavailableError();
	}
	const entryIds = rows
		.map((row) => row.entryId)
		.filter((entryId): entryId is string => entryId != null);
	const activeByEntry = await loadActiveRows(db, principal, entryIds);
	if (
		operation.operationType === "log_manifest_intakes"
			? rows.some(
					(row) =>
						row.voidedAt != null ||
						activeByEntry.get(row.entryId ?? "")?.id !== row.id,
				)
			: activeByEntry.size > 0
	) {
		throw new NutritionUndoUnavailableError();
	}
	// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch statement types are heterogeneous.
	const statements: any[] = [
		db
			.update(schema.nutritionOperation)
			.set({ undoneAt: now })
			.where(
				and(
					eq(schema.nutritionOperation.id, operationId),
					isNull(schema.nutritionOperation.undoneAt),
				),
			),
	];
	if (operation.operationType === "log_manifest_intakes") {
		statements.push(
			db
				.update(schema.nutritionIntake)
				.set({
					voidedAt: now,
					voidedByUserId: principal.userId,
					voidOperationId: null,
				})
				.where(
					and(
						eq(schema.nutritionIntake.userId, principal.userId),
						eq(schema.nutritionIntake.organizationId, principal.organizationId),
						eq(schema.nutritionIntake.operationId, operationId),
						isNull(schema.nutritionIntake.voidedAt),
					),
				),
		);
	}
	statements.push(
		db
			.update(schema.nutritionIntake)
			.set({
				voidedAt: null,
				voidedByUserId: null,
				voidOperationId: null,
			})
			.where(
				and(
					eq(schema.nutritionIntake.userId, principal.userId),
					eq(schema.nutritionIntake.organizationId, principal.organizationId),
					eq(schema.nutritionIntake.voidOperationId, operationId),
				),
			),
	);
	try {
		// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch statement types are heterogeneous.
		await db.batch(statements as [any, ...any[]]);
	} catch (error) {
		assertNoPersistenceInvariantError(error);
		if (errorIncludes(error, "nutrition_intake_user_org_entry_active_uidx")) {
			throw new NutritionUndoUnavailableError();
		}
		throw error;
	}
	const committed = await loadOperationById(db, principal, operationId);
	if (!committed?.undoneAt) {
		throw new NutritionUndoUnavailableError();
	}
	if (committed.undoneAt.getTime() !== now.getTime()) {
		return {
			operationId,
			undone: true,
			replayed: true,
			summaryGeneratedAt: committed.undoneAt.toISOString(),
			dayTotals: await dayTotalsForDates(env.DB, principal, dates),
		};
	}
	await db.insert(schema.nutritionAccessAudit).values(
		successAudit(principal, {
			eventType: "nutrition_intake_undo",
			requiredScope: "nutrition:write",
			consentPurpose: "intake",
			consentPolicyVersion: intakeConsent.statement.policyVersion,
			requestId: operationId,
			operationId,
			itemCount: operation.itemCount,
		}),
	);
	return {
		operationId,
		undone: true,
		replayed: false,
		summaryGeneratedAt: now.toISOString(),
		dayTotals: await dayTotalsForDates(env.DB, principal, dates),
	};
}

export const NutritionService = {
	setGoal,
	clearGoal,
	getGoal,
	getMealNutrition,
	logManifestIntakes,
	clearManifestIntakes,
	undoIntake,
	getSummary,
	getHistory,
	attachPersonalIntakeToEntries,
};

export { consentSource };
