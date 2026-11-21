import { and, eq, gte, inArray, isNull, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { data } from "react-router";
import { z } from "zod";
import * as schema from "~/db/schema";
import { getUserSettings, patchUserSettings } from "~/lib/auth.server";
import { isFeatureEnabled } from "~/lib/feature-flags/flags.server";
import { chunkArray, chunkedQuery } from "~/lib/query-utils.server";
import type { UserSettings } from "~/lib/types";
import { assertActiveNutritionConsent } from "./consent.server";
import { assertNutritionHealthExport } from "./fast-log-flag.server";
import { healthExportRulesFor } from "./fuel-capture";
import { nutritionIntakeRetentionCutoff } from "./goal-effective";
import {
	advanceHealthCursor,
	emptyHealthCursor,
	emptyHealthExclusions,
	type HealthCursor,
	type HealthExportExclusions,
	type HealthExportPlan,
	type HealthExportPreference,
	type HealthExportRules,
	type HealthExportStatus,
	type HealthIntakeRow,
	healthExportStatusOf,
	planHealthExport,
	planHealthPurge,
} from "./health-export";
import type {
	NutritionFlagContext,
	NutritionPrincipal,
} from "./service.server";

export class HealthExportConfirmationError extends Error {
	readonly code = "confirmation_required" as const;
	readonly status = 400;

	constructor() {
		super("Pass confirm:true to change Apple Health export.");
		this.name = "HealthExportConfirmationError";
	}
}

function readPreference(settings: UserSettings): HealthExportPreference {
	const raw = settings.healthExport;
	const deviceStatus = raw?.deviceStatus;
	const status: HealthExportPreference["deviceStatus"] =
		deviceStatus === "denied" ||
		deviceStatus === "on" ||
		deviceStatus === "needs_device_permission" ||
		deviceStatus === "off"
			? deviceStatus
			: "off";
	return {
		enabled: raw?.enabled === true,
		deviceStatus: status,
		clearRequested: raw?.clearRequested === true,
	};
}

/** Most changed rows one incremental pull returns before it says `truncated`. */
export const HEALTH_EXPORT_SINCE_ROW_CAP = 500;

/** Liveness lookups bind the user id plus one id per chunk entry. */
const LIVENESS_CHUNK = 90;

/** Sync-id updates sent in one D1 batch (each binds 4 values). */
const SYNC_ID_BATCH = 50;

/**
 * `syncedThrough` trails the server clock so a row committed in the same
 * second (created_at has second precision) or on a lagging replica is sent
 * again on the next pull. Re-sending is safe: HealthKit ignores a sample whose
 * sync version it already holds.
 */
export const HEALTH_EXPORT_SYNC_OVERLAP_MS = 60 * 1000;

/** A `since` this far ahead of the server clock is a bad device clock. */
const SINCE_FUTURE_SLACK_MS = 5 * 60 * 1000;

const INTAKE_COLUMNS = {
	id: schema.nutritionIntake.id,
	userId: schema.nutritionIntake.userId,
	organizationId: schema.nutritionIntake.organizationId,
	name: schema.nutritionIntake.mealNameSnapshot,
	voidedAt: schema.nutritionIntake.voidedAt,
	healthSyncId: schema.nutritionIntake.healthSyncId,
	healthSyncVersion: schema.nutritionIntake.healthSyncVersion,
	compositionSource: schema.nutritionIntake.compositionSource,
	compositionConfirmedAt: schema.nutritionIntake.compositionConfirmedAt,
	energyKcal: schema.nutritionIntake.energyKcal,
	proteinG: schema.nutritionIntake.proteinG,
	carbsG: schema.nutritionIntake.carbsG,
	fatG: schema.nutritionIntake.fatG,
	fiberG: schema.nutritionIntake.fiberG,
	occurredAt: schema.nutritionIntake.occurredAt,
	verified: schema.nutritionIntake.verified,
};

/**
 * The person's intake rows inside the retention window. With `since`, only
 * rows written or voided at or after that instant, capped so one pull stays
 * small; `truncated` tells the device to pull once more without `since`.
 */
async function loadRows(
	env: Env,
	principal: NutritionPrincipal,
	now: Date,
	since?: Date,
): Promise<{ rows: HealthIntakeRow[]; truncated: boolean }> {
	const db = drizzle(env.DB, { schema });
	const cutoff = nutritionIntakeRetentionCutoff(now);
	const base = and(
		eq(schema.nutritionIntake.userId, principal.userId),
		gte(schema.nutritionIntake.occurredAt, cutoff),
	);
	if (!since) {
		const rows = await db
			.select(INTAKE_COLUMNS)
			.from(schema.nutritionIntake)
			.where(base);
		return { rows, truncated: false };
	}
	const rows = await db
		.select(INTAKE_COLUMNS)
		.from(schema.nutritionIntake)
		.where(
			and(
				base,
				or(
					gte(schema.nutritionIntake.createdAt, since),
					gte(schema.nutritionIntake.voidedAt, since),
				),
			),
		)
		.orderBy(schema.nutritionIntake.occurredAt)
		.limit(HEALTH_EXPORT_SINCE_ROW_CAP + 1);
	const truncated = rows.length > HEALTH_EXPORT_SINCE_ROW_CAP;
	return {
		rows: truncated ? rows.slice(0, HEALTH_EXPORT_SINCE_ROW_CAP) : rows,
		truncated,
	};
}

/**
 * Sync ids a live row still carries, so a voided predecessor never deletes
 * them from Health. Covers live rows in the loaded set in any kitchen (the
 * planner may filter those out) and, by lookup, live rows outside the loaded
 * set (an edit made before `since`).
 */
async function liveSyncIdsFor(
	env: Env,
	principal: NutritionPrincipal,
	rows: readonly HealthIntakeRow[],
): Promise<Set<string>> {
	const liveHere = new Set<string>();
	for (const row of rows) {
		if (row.voidedAt == null && row.healthSyncId)
			liveHere.add(row.healthSyncId);
	}
	const candidates = [
		...new Set(
			rows
				.filter((row) => row.voidedAt != null && row.healthSyncId)
				.map((row) => row.healthSyncId as string)
				.filter((healthSyncId) => !liveHere.has(healthSyncId)),
		),
	];
	if (candidates.length === 0) return liveHere;
	const db = drizzle(env.DB, { schema });
	const found = await chunkedQuery(
		candidates,
		(chunk) =>
			db
				.select({ healthSyncId: schema.nutritionIntake.healthSyncId })
				.from(schema.nutritionIntake)
				.where(
					and(
						eq(schema.nutritionIntake.userId, principal.userId),
						isNull(schema.nutritionIntake.voidedAt),
						inArray(schema.nutritionIntake.healthSyncId, chunk),
					),
				),
		LIVENESS_CHUNK,
	);
	for (const row of found) {
		if (row.healthSyncId) liveHere.add(row.healthSyncId);
	}
	return liveHere;
}

/**
 * Give the person's live rows that have no Health sync id (logged before ids
 * existed, or by Manifest/Quick Eat before 1.11.28) an id at version 1, so
 * the current rule can export them. Person-scoped and race-safe: the update
 * only matches the caller's own row while its id is still null, and the ids
 * are read back from D1 so a concurrent assignment wins consistently.
 * Voided rows are skipped. Only the iOS device pull calls this.
 */
async function assignMissingSyncIds(
	env: Env,
	principal: NutritionPrincipal,
	rows: HealthIntakeRow[],
): Promise<HealthIntakeRow[]> {
	const missing = rows.filter(
		(row) =>
			row.userId === principal.userId &&
			row.voidedAt == null &&
			row.healthSyncId == null,
	);
	if (missing.length === 0) return rows;
	const db = drizzle(env.DB, { schema });
	const statements = missing.map((row) =>
		db
			.update(schema.nutritionIntake)
			.set({ healthSyncId: crypto.randomUUID(), healthSyncVersion: 1 })
			.where(
				and(
					eq(schema.nutritionIntake.id, row.id),
					eq(schema.nutritionIntake.userId, principal.userId),
					isNull(schema.nutritionIntake.healthSyncId),
				),
			),
	);
	for (const batch of chunkArray(statements, SYNC_ID_BATCH)) {
		await db.batch(batch as [(typeof batch)[number], ...typeof batch]);
	}
	const fresh = await chunkedQuery(
		missing.map((row) => row.id),
		(chunk) =>
			db
				.select({
					id: schema.nutritionIntake.id,
					healthSyncId: schema.nutritionIntake.healthSyncId,
					healthSyncVersion: schema.nutritionIntake.healthSyncVersion,
				})
				.from(schema.nutritionIntake)
				.where(
					and(
						eq(schema.nutritionIntake.userId, principal.userId),
						inArray(schema.nutritionIntake.id, chunk),
					),
				),
		LIVENESS_CHUNK,
	);
	const byId = new Map(fresh.map((row) => [row.id, row]));
	return rows.map((row) => {
		const next = byId.get(row.id);
		return next
			? {
					...row,
					healthSyncId: next.healthSyncId,
					healthSyncVersion: next.healthSyncVersion,
				}
			: row;
	});
}

async function assertCallerConsent(
	env: Env,
	principal: NutritionPrincipal,
	purpose: "intake",
) {
	if (principal.surface === "mcp" || principal.surface === "copilot") {
		await assertActiveNutritionConsent(
			env.DB,
			principal.userId,
			"agent_processing",
		);
	}
	await assertActiveNutritionConsent(env.DB, principal.userId, purpose);
}

export async function getHealthExportStatus(
	env: Env,
	principal: NutritionPrincipal,
	flags: NutritionFlagContext,
): Promise<{ status: HealthExportStatus; enabled: boolean }> {
	await assertNutritionHealthExport(env, flags);
	const preference = readPreference(
		await getUserSettings(env.DB, principal.userId),
	);
	return {
		status: healthExportStatusOf(preference),
		enabled: preference.enabled,
	};
}

export async function setHealthExportPreference(
	env: Env,
	principal: NutritionPrincipal,
	flags: NutritionFlagContext,
	input: {
		enabled: boolean;
		deviceStatus?: HealthExportPreference["deviceStatus"];
		confirm: boolean;
	},
): Promise<{ status: HealthExportStatus; enabled: boolean }> {
	await assertNutritionHealthExport(env, flags);
	if (!input.confirm) throw new HealthExportConfirmationError();
	if (input.enabled) {
		await assertCallerConsent(env, principal, "intake");
	}
	const current = readPreference(
		await getUserSettings(env.DB, principal.userId),
	);
	const next: HealthExportPreference = {
		enabled: input.enabled,
		deviceStatus: input.enabled
			? (input.deviceStatus ?? "needs_device_permission")
			: "off",
		clearRequested: input.enabled ? current.clearRequested : false,
	};
	await patchUserSettings(env.DB, principal.userId, { healthExport: next });
	return { status: healthExportStatusOf(next), enabled: next.enabled };
}

export async function clearHealthExport(
	env: Env,
	principal: NutritionPrincipal,
	flags: NutritionFlagContext,
	input: { confirm: boolean; completed?: boolean },
): Promise<{ clearRequested: boolean; status: HealthExportStatus }> {
	await assertNutritionHealthExport(env, flags);
	if (!input.confirm) throw new HealthExportConfirmationError();
	const current = readPreference(
		await getUserSettings(env.DB, principal.userId),
	);
	if (input.completed) {
		// The device finished deleting. Acknowledging only lowers a flag, so it
		// does not need intake consent (the person may have just withdrawn it).
		if (!current.clearRequested) {
			return { clearRequested: false, status: healthExportStatusOf(current) };
		}
		const done: HealthExportPreference = { ...current, clearRequested: false };
		await patchUserSettings(env.DB, principal.userId, { healthExport: done });
		return { clearRequested: false, status: healthExportStatusOf(done) };
	}
	await assertCallerConsent(env, principal, "intake");
	const next: HealthExportPreference = {
		...current,
		clearRequested: true,
	};
	await patchUserSettings(env.DB, principal.userId, { healthExport: next });
	return { clearRequested: true, status: healthExportStatusOf(next) };
}

export type HealthExportScope = "changes" | "all";

export type HealthExportPending = HealthExportPlan & {
	enabled: boolean;
	status: HealthExportStatus;
	clearRequested: boolean;
	/** True when `deletes` is a full purge of every Ration sample. */
	purge: boolean;
	/**
	 * True when an incremental pull hit the row cap. Nothing is planned; the
	 * device pulls again without `since` (a full, uncapped pull).
	 */
	truncated: boolean;
	/** Server time this pull covers up to. The device sends it back as `since`. */
	syncedThrough: string;
	excluded: HealthExportExclusions;
	nextCursor: HealthCursor;
};

/**
 * What the device should write to or delete from Apple Health.
 *
 * - `since`: only rows written or voided since that instant (incremental).
 * - `scope: "all"`: delete-only purge of every Ration sample in retention,
 *   used for turning export off with removal and account deletion. It works
 *   while export is off and without intake consent (it only returns ids).
 * - `cursor`: legacy per-id state (MCP preview). Optional.
 *
 * iOS 1.6.41+ and non-iOS callers get the current rule (every usable Fuel
 * log, AI estimates marked). Older iOS gets the legacy rule. Only the iOS
 * device pull on the current rule assigns missing sync ids; the MCP preview
 * stays read-only.
 */
export async function getHealthExportPending(
	env: Env,
	principal: NutritionPrincipal,
	flags: NutritionFlagContext,
	input: {
		cursor?: HealthCursor;
		since?: Date;
		scope?: HealthExportScope;
		now?: Date;
	},
): Promise<HealthExportPending> {
	await assertNutritionHealthExport(env, flags);
	// A purge only returns the person's own sync ids so the device can delete
	// copies. It must keep working after intake consent is withdrawn.
	if (input.scope !== "all") {
		await assertCallerConsent(env, principal, "intake");
	}
	const now = input.now ?? new Date();
	const cursor = input.cursor ?? emptyHealthCursor();
	const syncedThrough = new Date(
		now.getTime() - HEALTH_EXPORT_SYNC_OVERLAP_MS,
	).toISOString();
	const preference = readPreference(
		await getUserSettings(env.DB, principal.userId),
	);
	const purge = input.scope === "all" || preference.clearRequested;
	const empty = {
		samples: [],
		deletes: [],
		dailyTotals: [] as const,
		excluded: emptyHealthExclusions(),
		truncated: false,
		syncedThrough,
	};
	if (!purge && !preference.enabled) {
		return {
			...empty,
			enabled: false,
			status: "off",
			clearRequested: false,
			purge: false,
			nextCursor: cursor,
		};
	}
	if (purge) {
		const { rows } = await loadRows(env, principal, now);
		const deletes = planHealthPurge({
			rows,
			viewerUserId: principal.userId,
			extraSyncIds: Object.keys(cursor.written),
		});
		return {
			...empty,
			deletes,
			enabled: preference.enabled,
			status: healthExportStatusOf(preference),
			clearRequested: preference.clearRequested,
			purge: true,
			nextCursor: advanceHealthCursor(cursor, { samples: [], deletes }),
		};
	}
	const crossKitchen = await isFeatureEnabled(
		env,
		"nutrition-cross-org-diary",
		flags,
	);
	const rules: HealthExportRules = healthExportRulesFor(flags);
	const loaded = await loadRows(env, principal, now, input.since);
	const { truncated } = loaded;
	if (truncated) {
		return {
			...empty,
			enabled: preference.enabled,
			status: healthExportStatusOf(preference),
			clearRequested: false,
			purge: false,
			truncated: true,
			nextCursor: cursor,
		};
	}
	const rows =
		rules === "current" &&
		flags.clientPlatform === "ios" &&
		principal.surface !== "mcp" &&
		principal.surface !== "copilot"
			? await assignMissingSyncIds(env, principal, loaded.rows)
			: loaded.rows;
	const liveSyncIds = await liveSyncIdsFor(env, principal, rows);
	const plan = planHealthExport({
		rows,
		viewerUserId: principal.userId,
		activeOrganizationId: principal.organizationId,
		crossKitchen,
		cursor,
		liveSyncIds,
		rules,
	});
	return {
		...plan,
		enabled: preference.enabled,
		status: healthExportStatusOf(preference),
		clearRequested: false,
		purge: false,
		truncated,
		syncedThrough,
		nextCursor: advanceHealthCursor(cursor, plan),
	};
}

const PreferenceSchema = z.object({
	enabled: z.boolean(),
	deviceStatus: z
		.enum(["off", "needs_device_permission", "denied", "on"])
		.optional(),
	confirm: z.boolean(),
});

const ClearSchema = z.object({
	confirm: z.boolean(),
	/** Sent by the device after it has deleted every Ration sample. */
	completed: z.boolean().optional(),
});

const PendingQuerySchema = z.object({
	since: z.string().min(1).max(40).optional(),
	scope: z.enum(["changes", "all"]).optional(),
});

const CursorSchema = z.object({
	written: z.record(z.string(), z.number().int().nonnegative()).optional(),
	deleted: z.array(z.string()).optional(),
});

async function readJson(request: Request): Promise<unknown> {
	try {
		return await request.json();
	} catch {
		throw data({ error: "Invalid request" }, { status: 400 });
	}
}

/**
 * Reads `since` (an ISO instant the server returned as `syncedThrough`) and
 * `scope` from the pending URL. A `since` before the retention window is
 * harmless (the window bounds it); one in the future is refused.
 */
export function parseHealthPendingQuery(
	request: Request,
	now: Date = new Date(),
): { since?: Date; scope?: HealthExportScope } {
	const params = new URL(request.url).searchParams;
	const parsed = PendingQuerySchema.safeParse({
		since: params.get("since") ?? undefined,
		scope: params.get("scope") ?? undefined,
	});
	if (!parsed.success)
		throw data({ error: "Invalid request" }, { status: 400 });
	let since: Date | undefined;
	if (parsed.data.since) {
		since = new Date(parsed.data.since);
		if (
			Number.isNaN(since.getTime()) ||
			since.getTime() > now.getTime() + SINCE_FUTURE_SLACK_MS
		) {
			throw data({ error: "Invalid request" }, { status: 400 });
		}
	}
	return { since, scope: parsed.data.scope };
}

export function parseHealthCursor(request: Request): HealthCursor {
	const raw = new URL(request.url).searchParams.get("cursor");
	if (!raw) return { written: {}, deleted: [] };
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		throw data({ error: "Invalid request" }, { status: 400 });
	}
	const cursor = CursorSchema.safeParse(parsed);
	if (!cursor.success)
		throw data({ error: "Invalid request" }, { status: 400 });
	return {
		written: cursor.data.written ?? {},
		deleted: cursor.data.deleted ?? [],
	};
}

export async function putHealthExport(
	request: Request,
	env: Env,
	principal: NutritionPrincipal,
	flags: NutritionFlagContext,
) {
	const parsed = PreferenceSchema.safeParse(await readJson(request));
	if (!parsed.success)
		throw data({ error: "Invalid request" }, { status: 400 });
	return setHealthExportPreference(env, principal, flags, parsed.data);
}

export async function postClearHealthExport(
	request: Request,
	env: Env,
	principal: NutritionPrincipal,
	flags: NutritionFlagContext,
) {
	const parsed = ClearSchema.safeParse(await readJson(request));
	if (!parsed.success)
		throw data({ error: "Invalid request" }, { status: 400 });
	return clearHealthExport(env, principal, flags, parsed.data);
}

export async function getPendingHealthExport(
	request: Request,
	env: Env,
	principal: NutritionPrincipal,
	flags: NutritionFlagContext,
) {
	const now = new Date();
	const hasCursor = new URL(request.url).searchParams.has("cursor");
	const { since, scope } = parseHealthPendingQuery(request, now);
	const pending = await getHealthExportPending(env, principal, flags, {
		cursor: hasCursor ? parseHealthCursor(request) : undefined,
		since,
		scope,
		now,
	});
	if (hasCursor) return pending;
	// The cursor only grows; a client that never sent one does not need it.
	const { nextCursor: _nextCursor, ...rest } = pending;
	return rest;
}
