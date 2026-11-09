import { and, eq, gte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { data } from "react-router";
import { z } from "zod";
import * as schema from "~/db/schema";
import { getUserSettings, patchUserSettings } from "~/lib/auth.server";
import { isFeatureEnabled } from "~/lib/feature-flags/flags.server";
import type { UserSettings } from "~/lib/types";
import { assertActiveNutritionConsent } from "./consent.server";
import { assertNutritionHealthExport } from "./fast-log-flag.server";
import { nutritionIntakeRetentionCutoff } from "./goal-effective";
import {
	advanceHealthCursor,
	HEALTH_QUANTITY_TYPES,
	type HealthCursor,
	type HealthExportPlan,
	type HealthExportPreference,
	type HealthExportStatus,
	type HealthIntakeRow,
	healthExportStatusOf,
	healthSyncIdentifier,
	planHealthExport,
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

async function loadRows(
	env: Env,
	principal: NutritionPrincipal,
	now: Date,
): Promise<HealthIntakeRow[]> {
	const db = drizzle(env.DB, { schema });
	const cutoff = nutritionIntakeRetentionCutoff(now);
	const rows = await db
		.select({
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
		})
		.from(schema.nutritionIntake)
		.where(
			and(
				eq(schema.nutritionIntake.userId, principal.userId),
				gte(schema.nutritionIntake.occurredAt, cutoff),
			),
		);
	return rows;
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
	input: { confirm: boolean },
): Promise<{ clearRequested: true; status: HealthExportStatus }> {
	await assertNutritionHealthExport(env, flags);
	if (!input.confirm) throw new HealthExportConfirmationError();
	await assertCallerConsent(env, principal, "intake");
	const current = readPreference(
		await getUserSettings(env.DB, principal.userId),
	);
	const next: HealthExportPreference = {
		...current,
		clearRequested: true,
	};
	await patchUserSettings(env.DB, principal.userId, { healthExport: next });
	return { clearRequested: true, status: healthExportStatusOf(next) };
}

export async function getHealthExportPending(
	env: Env,
	principal: NutritionPrincipal,
	flags: NutritionFlagContext,
	input: { cursor: HealthCursor; now?: Date },
): Promise<
	HealthExportPlan & {
		enabled: boolean;
		status: HealthExportStatus;
		clearRequested: boolean;
		nextCursor: HealthCursor;
	}
> {
	await assertNutritionHealthExport(env, flags);
	await assertCallerConsent(env, principal, "intake");
	const preference = readPreference(
		await getUserSettings(env.DB, principal.userId),
	);
	if (!preference.enabled && !preference.clearRequested) {
		return {
			enabled: false,
			status: "off",
			clearRequested: false,
			samples: [],
			deletes: [],
			dailyTotals: [],
			nextCursor: input.cursor,
		};
	}
	const crossKitchen = await isFeatureEnabled(
		env,
		"nutrition-cross-org-diary",
		flags,
	);
	const rows = await loadRows(env, principal, input.now ?? new Date());
	const plan = planHealthExport({
		rows,
		viewerUserId: principal.userId,
		activeOrganizationId: principal.organizationId,
		crossKitchen,
		cursor: input.cursor,
	});
	const deletes = preference.clearRequested
		? [
				...plan.deletes,
				...Object.keys(input.cursor.written)
					.filter(
						(healthSyncId) =>
							!plan.deletes.some((item) => item.healthSyncId === healthSyncId),
					)
					.map((healthSyncId) => ({
						action: "delete" as const,
						healthSyncId,
						syncIdentifiers: HEALTH_QUANTITY_TYPES.map((nutrient) =>
							healthSyncIdentifier(healthSyncId, nutrient),
						),
					})),
			]
		: plan.deletes;
	const samples = preference.clearRequested ? [] : plan.samples;
	const nextPlan = { samples, deletes, dailyTotals: [] as const };
	return {
		enabled: preference.enabled,
		status: healthExportStatusOf(preference),
		clearRequested: preference.clearRequested,
		samples,
		deletes,
		dailyTotals: [],
		nextCursor: advanceHealthCursor(input.cursor, nextPlan),
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
	return getHealthExportPending(env, principal, flags, {
		cursor: parseHealthCursor(request),
	});
}
