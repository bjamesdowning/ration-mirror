import {
	and,
	asc,
	count,
	desc,
	eq,
	gte,
	inArray,
	isNotNull,
	lt,
	lte,
	or,
} from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { z } from "zod";
import { cargo, kitchenEvent } from "~/db/schema";
import {
	type CargoExpiredPayload,
	type CargoJettisonedPayload,
	cargoExpiredPayloadSchema,
	cargoJettisonedPayloadSchema,
	type GalleyCookedPayload,
	galleyCookedPayloadSchema,
	KITCHEN_EVENT_TYPES,
	type KitchenEventSource,
	type KitchenEventType,
	kitchenEventTypeSchema,
	type ManifestConsumedPayload,
	type ManifestCookedPayload,
	manifestConsumedPayloadSchema,
	manifestCookedPayloadSchema,
	type SupplyDockedPayload,
	supplyDockedPayloadSchema,
} from "~/lib/schemas/kitchen-events";
import { redactPersonalNutritionFromPayload } from "./kitchen-event-privacy";
import {
	chunkArray,
	D1_MAX_BOUND_PARAMS,
	D1_MAX_KITCHEN_EVENT_ROWS_PER_STATEMENT,
	KITCHEN_EVENT_INSERT_COLUMNS,
	packByBindBudget,
} from "./query-utils.server";

/** Raw event retention: 13 months (≈396 days) for year-over-year comparisons. */
export const KITCHEN_EVENT_RETENTION_DAYS = 396;

/** Max rows deleted per retention cron run (bounded job). */
export const KITCHEN_EVENT_RETENTION_DELETE_CAP = 5000;

/** Max cargo_expired events emitted per cron run. */
export const KITCHEN_EVENT_EXPIRY_DETECT_CAP = 500;

type PayloadByType = {
	galley_cooked: GalleyCookedPayload;
	manifest_consumed: ManifestConsumedPayload;
	manifest_cooked: ManifestCookedPayload;
	supply_docked: SupplyDockedPayload;
	cargo_expired: CargoExpiredPayload;
	cargo_jettisoned: CargoJettisonedPayload;
};

type RegistryEntry<T extends KitchenEventType> = {
	description: string;
	zodPayloadSchema: z.ZodType<PayloadByType[T]>;
};

export const KITCHEN_EVENT_REGISTRY: {
	[K in KitchenEventType]: RegistryEntry<K>;
} = {
	galley_cooked: {
		description: "Meal cooked from the Galley (direct cook)",
		zodPayloadSchema: galleyCookedPayloadSchema,
	},
	manifest_consumed: {
		description: "Meal plan entry marked consumed from the Manifest",
		zodPayloadSchema: manifestConsumedPayloadSchema,
	},
	manifest_cooked: {
		description: "Meal plan entry prepared (shared Cargo deduction)",
		zodPayloadSchema: manifestCookedPayloadSchema,
	},
	supply_docked: {
		description: "Purchased supply item docked into cargo",
		zodPayloadSchema: supplyDockedPayloadSchema,
	},
	cargo_expired: {
		description: "Cargo item crossed into expired (system detector)",
		zodPayloadSchema: cargoExpiredPayloadSchema,
	},
	cargo_jettisoned: {
		description: "Cargo item removed from inventory",
		zodPayloadSchema: cargoJettisonedPayloadSchema,
	},
};

export function isKitchenEventType(value: string): value is KitchenEventType {
	return (KITCHEN_EVENT_TYPES as readonly string[]).includes(value);
}

export function listKitchenEventTypes(): KitchenEventType[] {
	return [...KITCHEN_EVENT_TYPES];
}

export type KitchenEventInput<T extends KitchenEventType = KitchenEventType> = {
	organizationId: string;
	userId?: string | null;
	eventType: T;
	subjectName: string;
	mealId?: string | null;
	cargoId?: string | null;
	payload: PayloadByType[T];
	occurredAt?: Date;
	/** Pre-generated id (required for undo compensation). */
	id?: string;
};

export type KitchenEventRow = {
	id: string;
	organizationId: string;
	userId: string | null;
	eventType: string;
	occurredAt: Date;
	mealId: string | null;
	cargoId: string | null;
	subjectName: string;
	payload: Record<string, unknown>;
};

function toInsertValues(input: KitchenEventInput): {
	id: string;
	organizationId: string;
	userId: string | null;
	eventType: string;
	occurredAt: Date;
	mealId: string | null;
	cargoId: string | null;
	subjectName: string;
	payload: Record<string, unknown>;
} {
	const entry = KITCHEN_EVENT_REGISTRY[input.eventType];
	const payload = entry.zodPayloadSchema.parse(input.payload);
	return {
		id: input.id ?? crypto.randomUUID(),
		organizationId: input.organizationId,
		userId: input.userId ?? null,
		eventType: input.eventType,
		occurredAt: input.occurredAt ?? new Date(),
		mealId: input.mealId ?? null,
		cargoId: input.cargoId ?? null,
		subjectName: input.subjectName,
		payload: payload as Record<string, unknown>,
	};
}

/**
 * Builds chunked Drizzle INSERT statements for kitchen_event rows.
 * Append the returned statements to the caller's existing `db.batch()` so
 * recording is atomic with the mutation (zero extra round-trips).
 * Returns the generated event ids (for undo token payloads) and bind-budget
 * metadata for `packByBindBudget` when mixing with other dense statements.
 */
export function buildKitchenEventInserts(
	// biome-ignore lint/suspicious/noExplicitAny: Drizzle D1 db typing is complex across call sites
	d1: any,
	events: KitchenEventInput[],
): {
	stmts: unknown[];
	eventIds: string[];
	budgeted: Array<{ bindCount: number; value: unknown }>;
} {
	if (events.length === 0) return { stmts: [], eventIds: [], budgeted: [] };

	const rows = events.map(toInsertValues);
	const eventIds = rows.map((r) => r.id);
	const budgeted = chunkArray(
		rows,
		D1_MAX_KITCHEN_EVENT_ROWS_PER_STATEMENT,
	).map((chunk) => ({
		bindCount: chunk.length * KITCHEN_EVENT_INSERT_COLUMNS,
		value: d1.insert(kitchenEvent).values(chunk),
	}));
	return {
		stmts: budgeted.map((b) => b.value),
		eventIds,
		budgeted,
	};
}

/** Convenience: insert events in their own batch (when caller has no existing batch). */
export async function recordKitchenEvents(
	db: D1Database,
	events: KitchenEventInput[],
): Promise<string[]> {
	if (events.length === 0) return [];
	const d1 = drizzle(db);
	const { budgeted, eventIds } = buildKitchenEventInserts(d1, events);
	if (budgeted.length === 0) return eventIds;
	for (const batch of packByBindBudget(budgeted)) {
		// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types are complex
		await d1.batch(batch as [any, ...any[]]);
	}
	return eventIds;
}

/** Build DELETE statements that remove events by id (undo compensation). */
export function buildKitchenEventDeleteStmts(
	// biome-ignore lint/suspicious/noExplicitAny: Drizzle D1 db typing is complex across call sites
	d1: any,
	organizationId: string,
	eventIds: string[],
): unknown[] {
	if (eventIds.length === 0) return [];
	const stmts: unknown[] = [];
	for (const chunk of chunkArray(eventIds, D1_MAX_BOUND_PARAMS - 1)) {
		stmts.push(
			d1
				.delete(kitchenEvent)
				.where(
					and(
						eq(kitchenEvent.organizationId, organizationId),
						inArray(kitchenEvent.id, chunk),
					),
				),
		);
	}
	return stmts;
}

export type GetKitchenEventsOptions = {
	types?: KitchenEventType[];
	from?: Date;
	to?: Date;
	limit?: number;
	/**
	 * Opaque cursor from a previous `nextCursor`.
	 * Format: `${occurredAtISO}|${id}` (compound so same-second rows are not skipped).
	 * Legacy ISO-only cursors are still accepted (occurredAt-only, may skip ties).
	 */
	cursor?: string;
};

const DEFAULT_EVENTS_LIMIT = 50;
const MAX_EVENTS_LIMIT = 100;

export function encodeKitchenEventCursor(occurredAt: Date, id: string): string {
	return `${occurredAt.toISOString()}|${id}`;
}

export function decodeKitchenEventCursor(
	cursor: string,
): { occurredAt: Date; id: string | null } | null {
	const pipe = cursor.indexOf("|");
	if (pipe === -1) {
		const occurredAt = new Date(cursor);
		if (Number.isNaN(occurredAt.getTime())) return null;
		return { occurredAt, id: null };
	}
	const occurredAt = new Date(cursor.slice(0, pipe));
	const id = cursor.slice(pipe + 1);
	if (Number.isNaN(occurredAt.getTime()) || !id) return null;
	return { occurredAt, id };
}

export async function getKitchenEvents(
	db: D1Database,
	organizationId: string,
	options: GetKitchenEventsOptions = {},
): Promise<{ events: KitchenEventRow[]; nextCursor: string | null }> {
	const d1 = drizzle(db);
	const limit = Math.min(
		Math.max(options.limit ?? DEFAULT_EVENTS_LIMIT, 1),
		MAX_EVENTS_LIMIT,
	);

	const conditions = [eq(kitchenEvent.organizationId, organizationId)];
	if (options.types && options.types.length > 0) {
		conditions.push(inArray(kitchenEvent.eventType, options.types));
	}
	if (options.from) {
		conditions.push(gte(kitchenEvent.occurredAt, options.from));
	}
	if (options.to) {
		conditions.push(lte(kitchenEvent.occurredAt, options.to));
	}
	if (options.cursor) {
		const decoded = decodeKitchenEventCursor(options.cursor);
		if (decoded) {
			if (decoded.id) {
				const tieBreak = and(
					eq(kitchenEvent.occurredAt, decoded.occurredAt),
					lt(kitchenEvent.id, decoded.id),
				);
				conditions.push(
					or(lt(kitchenEvent.occurredAt, decoded.occurredAt), tieBreak) ??
						lt(kitchenEvent.occurredAt, decoded.occurredAt),
				);
			} else {
				conditions.push(lt(kitchenEvent.occurredAt, decoded.occurredAt));
			}
		}
	}

	const rows = await d1
		.select()
		.from(kitchenEvent)
		.where(and(...conditions))
		.orderBy(desc(kitchenEvent.occurredAt), desc(kitchenEvent.id))
		.limit(limit + 1);

	const hasMore = rows.length > limit;
	const page = hasMore ? rows.slice(0, limit) : rows;
	const last = page[page.length - 1];
	const nextCursor =
		hasMore && last?.occurredAt
			? encodeKitchenEventCursor(new Date(last.occurredAt), last.id)
			: null;

	return {
		events: page.map((r) => ({
			id: r.id,
			organizationId: r.organizationId,
			userId: r.userId,
			eventType: r.eventType,
			occurredAt: r.occurredAt,
			mealId: r.mealId,
			cargoId: r.cargoId,
			subjectName: r.subjectName,
			payload: redactPersonalNutritionFromPayload(
				(r.payload ?? {}) as Record<string, unknown>,
			),
		})),
		nextCursor,
	};
}

export type KitchenStatsWindow = "7d" | "30d" | "90d" | "365d";

const WINDOW_DAYS: Record<KitchenStatsWindow, number> = {
	"7d": 7,
	"30d": 30,
	"90d": 90,
	"365d": 365,
};

export type KitchenStats = {
	window: KitchenStatsWindow;
	from: string;
	to: string;
	countsByType: Record<string, number>;
	topCookedMeals: Array<{
		subjectName: string;
		mealId: string | null;
		count: number;
	}>;
	totals: {
		cooked: number;
		docked: number;
		expired: number;
		jettisoned: number;
	};
};

export async function getKitchenStats(
	db: D1Database,
	organizationId: string,
	window: KitchenStatsWindow = "7d",
	now = new Date(),
): Promise<KitchenStats> {
	const d1 = drizzle(db);
	const days = WINDOW_DAYS[window] ?? 7;
	const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

	const countRows = await d1
		.select({
			eventType: kitchenEvent.eventType,
			total: count(),
		})
		.from(kitchenEvent)
		.where(
			and(
				eq(kitchenEvent.organizationId, organizationId),
				gte(kitchenEvent.occurredAt, from),
				lte(kitchenEvent.occurredAt, now),
			),
		)
		.groupBy(kitchenEvent.eventType);

	const countsByType: Record<string, number> = {};
	for (const t of KITCHEN_EVENT_TYPES) {
		countsByType[t] = 0;
	}
	for (const row of countRows) {
		countsByType[row.eventType] = Math.trunc(Number(row.total)) || 0;
	}

	const topRows = await d1
		.select({
			subjectName: kitchenEvent.subjectName,
			mealId: kitchenEvent.mealId,
			total: count(),
		})
		.from(kitchenEvent)
		.where(
			and(
				eq(kitchenEvent.organizationId, organizationId),
				inArray(kitchenEvent.eventType, [
					"galley_cooked",
					"manifest_consumed",
					"manifest_cooked",
				]),
				gte(kitchenEvent.occurredAt, from),
				lte(kitchenEvent.occurredAt, now),
			),
		)
		.groupBy(kitchenEvent.subjectName, kitchenEvent.mealId)
		.orderBy(desc(count()))
		.limit(10);

	const cooked =
		(countsByType.galley_cooked ?? 0) +
		(countsByType.manifest_consumed ?? 0) +
		(countsByType.manifest_cooked ?? 0);

	return {
		window,
		from: from.toISOString(),
		to: now.toISOString(),
		countsByType,
		topCookedMeals: topRows.map((r) => ({
			subjectName: r.subjectName,
			mealId: r.mealId,
			count: Math.trunc(Number(r.total)) || 0,
		})),
		totals: {
			cooked,
			docked: countsByType.supply_docked ?? 0,
			expired: countsByType.cargo_expired ?? 0,
			jettisoned: countsByType.cargo_jettisoned ?? 0,
		},
	};
}

/** Retention cutoff date for raw kitchen_event rows. */
export function kitchenEventRetentionCutoff(
	now = new Date(),
	retentionDays = KITCHEN_EVENT_RETENTION_DAYS,
): Date {
	return new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
}

/**
 * Deletes kitchen_event rows older than the retention cutoff.
 * Bounded per run; backlog drains across subsequent cron invocations.
 */
export async function purgeExpiredKitchenEvents(
	db: D1Database,
	options?: {
		now?: Date;
		retentionDays?: number;
		deleteCap?: number;
	},
): Promise<number> {
	const d1 = drizzle(db);
	const cutoff = kitchenEventRetentionCutoff(
		options?.now,
		options?.retentionDays,
	);
	const deleteCap = options?.deleteCap ?? KITCHEN_EVENT_RETENTION_DELETE_CAP;

	const staleIds = await d1
		.select({ id: kitchenEvent.id })
		.from(kitchenEvent)
		.where(lt(kitchenEvent.occurredAt, cutoff))
		.orderBy(asc(kitchenEvent.occurredAt))
		.limit(deleteCap);

	if (staleIds.length === 0) return 0;

	let deleted = 0;
	for (const chunk of chunkArray(
		staleIds.map((r) => r.id),
		D1_MAX_BOUND_PARAMS,
	)) {
		await d1.delete(kitchenEvent).where(inArray(kitchenEvent.id, chunk));
		deleted += chunk.length;
	}
	return deleted;
}

/**
 * Emits `cargo_expired` for cargo whose expiresAt is in the past and that
 * do not yet have a cargo_expired event covering this expiry window.
 * Idempotent per (cargoId, expiresAt): extending expiresAt and letting the
 * item expire again will emit a new event. `occurredAt` is the expiry
 * calendar day (not the cron run time).
 */
export async function detectAndRecordExpiredCargo(
	db: D1Database,
	options?: { now?: Date; cap?: number },
): Promise<number> {
	const d1 = drizzle(db);
	const now = options?.now ?? new Date();
	const cap = options?.cap ?? KITCHEN_EVENT_EXPIRY_DETECT_CAP;

	// Start-of-today UTC: an item "expires" when its calendar date is before today.
	const startOfToday = new Date(
		Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
	);

	const candidates = await d1
		.select({
			id: cargo.id,
			organizationId: cargo.organizationId,
			name: cargo.name,
			quantity: cargo.quantity,
			unit: cargo.unit,
			domain: cargo.domain,
			expiresAt: cargo.expiresAt,
		})
		.from(cargo)
		.where(and(isNotNull(cargo.expiresAt), lt(cargo.expiresAt, startOfToday)))
		.orderBy(asc(cargo.expiresAt))
		.limit(cap * 2);

	if (candidates.length === 0) return 0;

	const candidateIds = candidates.map((c) => c.id);
	/** Latest cargo_expired.occurredAt per cargoId (used for extend+re-expire). */
	const latestExpiredAt = new Map<string, Date>();
	for (const chunk of chunkArray(candidateIds, D1_MAX_BOUND_PARAMS - 1)) {
		const existing = await d1
			.select({
				cargoId: kitchenEvent.cargoId,
				occurredAt: kitchenEvent.occurredAt,
			})
			.from(kitchenEvent)
			.where(
				and(
					eq(kitchenEvent.eventType, "cargo_expired"),
					inArray(kitchenEvent.cargoId, chunk),
				),
			);
		for (const row of existing) {
			if (!row.cargoId) continue;
			const at = new Date(row.occurredAt);
			const prev = latestExpiredAt.get(row.cargoId);
			if (!prev || at > prev) latestExpiredAt.set(row.cargoId, at);
		}
	}

	const toRecord = candidates
		.filter((c) => {
			if (!c.expiresAt) return false;
			const expiresAt = new Date(c.expiresAt);
			const last = latestExpiredAt.get(c.id);
			// Already recorded for this expiry window (or a later one).
			return !last || last < expiresAt;
		})
		.slice(0, cap);

	if (toRecord.length === 0) return 0;

	const events: KitchenEventInput<"cargo_expired">[] = toRecord.map((c) => {
		const expiresAt = c.expiresAt ? new Date(c.expiresAt) : startOfToday;
		return {
			organizationId: c.organizationId,
			userId: null,
			eventType: "cargo_expired",
			subjectName: c.name,
			cargoId: c.id,
			payload: {
				quantity: c.quantity,
				unit: c.unit,
				expiresAt: expiresAt.toISOString(),
				domain: c.domain ?? undefined,
			},
			// Stamp as the expiry calendar day so timelines reflect when it expired.
			occurredAt: expiresAt,
		};
	});

	await recordKitchenEvents(db, events);
	return events.length;
}

/** Helpers for building typed event inputs at call sites. */
export function buildGalleyCookedEvent(input: {
	organizationId: string;
	userId?: string | null;
	mealId: string;
	mealName: string;
	servings: number;
	deductions: Array<{ cargoId: string; quantity: number }>;
	partialCook?: boolean;
	source?: KitchenEventSource;
	occurredAt?: Date;
	id?: string;
}): KitchenEventInput<"galley_cooked"> {
	return {
		id: input.id,
		organizationId: input.organizationId,
		userId: input.userId,
		eventType: "galley_cooked",
		subjectName: input.mealName,
		mealId: input.mealId,
		payload: {
			servings: input.servings,
			deductions: input.deductions,
			partialCook: input.partialCook,
			source: input.source,
		},
		occurredAt: input.occurredAt,
	};
}

export function buildManifestConsumedEvent(input: {
	organizationId: string;
	userId?: string | null;
	mealId: string;
	mealName: string;
	planId: string;
	entryIds: string[];
	date?: string;
	slotType?: string;
	servings: number;
	deductions: Array<{ cargoId: string; quantity: number }>;
	partialCook?: boolean;
	source?: KitchenEventSource;
	occurredAt?: Date;
	id?: string;
}): KitchenEventInput<"manifest_consumed"> {
	return {
		id: input.id,
		organizationId: input.organizationId,
		userId: input.userId,
		eventType: "manifest_consumed",
		subjectName: input.mealName,
		mealId: input.mealId,
		payload: {
			planId: input.planId,
			entryIds: input.entryIds,
			date: input.date,
			slotType: input.slotType,
			servings: input.servings,
			deductions: input.deductions,
			partialCook: input.partialCook,
			source: input.source,
		},
		occurredAt: input.occurredAt,
	};
}

export function buildManifestCookedEvent(input: {
	organizationId: string;
	userId?: string | null;
	mealId: string;
	mealName: string;
	planId: string;
	entryIds: string[];
	date?: string;
	slotType?: string;
	servings: number;
	deductions: Array<{ cargoId: string; quantity: number }>;
	partialCook?: boolean;
	source?: KitchenEventSource;
	occurredAt?: Date;
	id?: string;
}): KitchenEventInput<"manifest_cooked"> {
	return {
		id: input.id,
		organizationId: input.organizationId,
		userId: input.userId,
		eventType: "manifest_cooked",
		subjectName: input.mealName,
		mealId: input.mealId,
		payload: {
			planId: input.planId,
			entryIds: input.entryIds,
			date: input.date,
			slotType: input.slotType,
			servings: input.servings,
			deductions: input.deductions,
			partialCook: input.partialCook,
			source: input.source,
		},
		occurredAt: input.occurredAt,
	};
}

export function buildSupplyDockedEvent(input: {
	organizationId: string;
	userId?: string | null;
	itemName: string;
	quantity: number;
	unit: string;
	domain?: string;
	cargoId?: string | null;
	sourceCargoId?: string | null;
	source?: KitchenEventSource;
	occurredAt?: Date;
	id?: string;
}): KitchenEventInput<"supply_docked"> {
	return {
		id: input.id,
		organizationId: input.organizationId,
		userId: input.userId,
		eventType: "supply_docked",
		subjectName: input.itemName,
		cargoId: input.cargoId,
		payload: {
			quantity: input.quantity,
			unit: input.unit,
			domain: input.domain,
			sourceCargoId: input.sourceCargoId ?? null,
			source: input.source,
		},
		occurredAt: input.occurredAt,
	};
}

export function buildCargoJettisonedEvent(input: {
	organizationId: string;
	userId?: string | null;
	cargoId: string;
	name: string;
	quantity: number;
	unit: string;
	domain?: string;
	wasExpired: boolean;
	expiresAt?: Date | null;
	source?: KitchenEventSource;
	occurredAt?: Date;
	id?: string;
}): KitchenEventInput<"cargo_jettisoned"> {
	return {
		id: input.id,
		organizationId: input.organizationId,
		userId: input.userId,
		eventType: "cargo_jettisoned",
		subjectName: input.name,
		cargoId: input.cargoId,
		payload: {
			quantity: input.quantity,
			unit: input.unit,
			domain: input.domain,
			wasExpired: input.wasExpired,
			expiresAt: input.expiresAt
				? new Date(input.expiresAt).toISOString()
				: null,
			source: input.source,
		},
		occurredAt: input.occurredAt,
	};
}

export { kitchenEventTypeSchema };
