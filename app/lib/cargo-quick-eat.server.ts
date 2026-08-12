/**
 * Cargo Quick Eat — ensure unit-portion provision → today's Manifest snack →
 * Cook (silent partial deduct) → optional private intake.
 */

import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { cargo } from "~/db/schema";
import { assertFeatureEnabled } from "~/lib/feature-flags/assert-enabled.server";
import type { FlagshipEvaluationContext } from "~/lib/feature-flags/context.server";
import { isFeatureEnabled } from "~/lib/feature-flags/flags.server";
import { cookMealFromGalley } from "~/lib/galley-cook-manifest.server";
import { log } from "~/lib/logging.server";
import { ensureProvisionFromCargo } from "~/lib/meals.server";
import {
	deriveNutritionOperationKey,
	logManifestIntakes,
	type NutritionPrincipal,
} from "~/lib/nutrition/service.server";
import {
	clampIntakeServings,
	cookServingsForCargoAmount,
} from "~/lib/provision-portion";
import type { KitchenEventSource } from "~/lib/schemas/kitchen-events";
import { convertQuantity, toSupportedUnit } from "~/lib/units";

const QUICK_EAT_IDEMPOTENCY_TTL_SECONDS = 86_400;

export type QuickEatIntakeSkipReason =
	| "flag_off"
	| "consent"
	| "nutrition_unavailable"
	| "clamped"
	| "error"
	| null;

export type QuickEatResult = {
	cargo: {
		id: string;
		name: string;
		quantity: number;
		unit: string;
	};
	provision: {
		id: string;
		alreadyExisted: boolean;
		normalized: boolean;
	};
	entry: {
		id: string;
		planId: string;
		date: string;
		slotType: string;
		cookedAt: string | null;
	};
	cookServings: number;
	requestedQuantity: number;
	deductedQuantity: number;
	stockWasShort: boolean;
	intakeLogged: boolean;
	intakeSkipReason: QuickEatIntakeSkipReason;
	intakeServings: number | null;
};

export class QuickEatValidationError extends Error {
	readonly code: string;
	constructor(code: string, message: string) {
		super(message);
		this.name = "QuickEatValidationError";
		this.code = code;
	}
}

export class QuickEatNotFoundError extends Error {
	readonly code = "cargo_not_found" as const;
	constructor() {
		super("Cargo item not found");
		this.name = "QuickEatNotFoundError";
	}
}

function idempotencyKey(
	organizationId: string,
	userId: string,
	operationKey: string,
): string {
	return `quick-eat:v1:${organizationId}:${userId}:${operationKey}`;
}

async function loadCachedResult(
	kv: KVNamespace | undefined,
	key: string,
): Promise<QuickEatResult | null> {
	if (!kv) return null;
	try {
		const raw = await kv.get(key, "json");
		if (raw && typeof raw === "object" && "entry" in raw) {
			return raw as QuickEatResult;
		}
	} catch {
		/* ignore cache read failures */
	}
	return null;
}

async function storeCachedResult(
	kv: KVNamespace | undefined,
	key: string,
	result: QuickEatResult,
): Promise<void> {
	if (!kv) return;
	try {
		await kv.put(key, JSON.stringify(result), {
			expirationTtl: QUICK_EAT_IDEMPOTENCY_TTL_SECONDS,
		});
	} catch (err) {
		log.warn("quick eat idempotency store failed", {
			detail: err instanceof Error ? err.message : String(err),
		});
	}
}

export async function quickEatFromCargo(
	env: Env,
	organizationId: string,
	principal: NutritionPrincipal,
	flagContext: FlagshipEvaluationContext,
	input: {
		cargoId: string;
		quantity: number;
		unit?: string;
		date: string;
		operationKey: string;
		logIntake?: boolean;
		notes?: string | null;
		source?: KitchenEventSource;
	},
): Promise<QuickEatResult> {
	await assertFeatureEnabled(env, "cargo-quick-eat", flagContext);
	await assertFeatureEnabled(env, "nutrition-cook-log-split", flagContext);

	if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
		throw new QuickEatValidationError(
			"invalid_quantity",
			"Quantity must be greater than zero",
		);
	}

	const cacheKey = idempotencyKey(
		organizationId,
		principal.userId,
		input.operationKey,
	);
	const cached = await loadCachedResult(env.RATION_KV, cacheKey);
	if (cached) return cached;

	const d1 = drizzle(env.DB);
	const [cargoItem] = await d1
		.select()
		.from(cargo)
		.where(
			and(
				eq(cargo.id, input.cargoId),
				eq(cargo.organizationId, organizationId),
			),
		)
		.limit(1);

	if (!cargoItem) {
		throw new QuickEatNotFoundError();
	}

	const requestedUnit = toSupportedUnit(input.unit ?? cargoItem.unit);
	const cargoUnit = toSupportedUnit(cargoItem.unit);
	const requestedInCargoUnit = convertQuantity(
		input.quantity,
		requestedUnit,
		cargoUnit,
	);
	if (requestedInCargoUnit == null) {
		throw new QuickEatValidationError(
			"invalid_unit",
			"Unit does not match this cargo item",
		);
	}

	const available = cargoItem.quantity;
	const deductedQuantity = Math.max(
		0,
		Math.min(requestedInCargoUnit, available),
	);
	const stockWasShort = deductedQuantity + 1e-9 < requestedInCargoUnit;

	const ensured = await ensureProvisionFromCargo(
		env,
		organizationId,
		input.cargoId,
		flagContext,
	);
	if (!ensured.provision) {
		throw new QuickEatNotFoundError();
	}

	const ingredient = ensured.provision.ingredients[0];
	if (!ingredient) {
		throw new QuickEatValidationError(
			"provision_incomplete",
			"Provision has no ingredient",
		);
	}

	const cookServings = cookServingsForCargoAmount({
		requestedQuantity: input.quantity,
		requestedUnit: requestedUnit,
		ingredientQuantity: ingredient.quantity,
		ingredientUnit: ingredient.unit,
	});
	if (cookServings == null) {
		throw new QuickEatValidationError(
			"invalid_unit",
			"Cannot scale portion for this unit",
		);
	}

	const cookResult = await cookMealFromGalley(
		env,
		organizationId,
		ensured.provision.id,
		{
			flagContext,
			servings: cookServings,
			// Silent partial: never surface short-stock confirm to Quick Eat clients.
			confirmInsufficient: true,
			userId: principal.userId,
			source: input.source ?? "mobile",
			date: input.date,
			slotType: "snack",
		},
	);

	if (!cookResult.cooked || !cookResult.entry || !cookResult.planId) {
		throw new QuickEatValidationError(
			"cook_failed",
			"Could not prepare snack on Manifest",
		);
	}

	const [cargoAfter] = await d1
		.select({
			id: cargo.id,
			name: cargo.name,
			quantity: cargo.quantity,
			unit: cargo.unit,
		})
		.from(cargo)
		.where(eq(cargo.id, input.cargoId))
		.limit(1);

	let intakeLogged = false;
	let intakeSkipReason: QuickEatIntakeSkipReason = null;
	let intakeServings: number | null = null;

	const wantIntake = input.logIntake !== false;
	const manifestOn = await isFeatureEnabled(
		env,
		"nutrition-manifest",
		flagContext,
	);

	if (!wantIntake || !manifestOn || !cookResult.offerPersonalLog) {
		intakeSkipReason = "flag_off";
	} else {
		const clamped = clampIntakeServings(cookServings);
		intakeServings = clamped.servings;
		try {
			// Best-effort sync-recompute before plate-up. Failure must not block
			// intake when meal.nutrition is already usable from a prior compute.
			try {
				const { recomputeAndStoreMealNutrition } = await import(
					"~/lib/nutrition/persist.server"
				);
				await recomputeAndStoreMealNutrition(
					env,
					env.DB,
					ensured.provision.id,
					organizationId,
					flagContext,
				);
			} catch (recomputeErr) {
				log.warn("quick eat recompute before intake failed", {
					detail:
						recomputeErr instanceof Error
							? recomputeErr.message
							: String(recomputeErr),
				});
			}
			// logManifestIntakes requires RFC UUID operation/item keys — derive
			// deterministic UUIDs from the client Quick Eat key for idempotent retries.
			const intakeOperationKey = await deriveNutritionOperationKey([
				`${input.operationKey}:intake`,
			]);
			const intakeItemKey = await deriveNutritionOperationKey([
				`${input.operationKey}:intake-item`,
			]);
			await logManifestIntakes(env, principal, flagContext, {
				operationKey: intakeOperationKey,
				planId: cookResult.planId,
				items: [
					{
						entryId: cookResult.entry.id,
						servings: clamped.servings,
						idempotencyKey: intakeItemKey,
						notes: input.notes ?? null,
					},
				],
			});
			intakeLogged = true;
			if (clamped.clamped) {
				intakeSkipReason = "clamped";
			}
		} catch (err) {
			const code =
				err && typeof err === "object" && "code" in err
					? String((err as { code: unknown }).code)
					: "";
			if (code.includes("consent") || /consent/i.test(String(err))) {
				intakeSkipReason = "consent";
			} else if (
				code === "nutrition_unavailable" ||
				code === "nutrition_updating"
			) {
				intakeSkipReason = "nutrition_unavailable";
			} else {
				intakeSkipReason = "error";
				log.warn("quick eat intake skipped", {
					detail: err instanceof Error ? err.message : String(err),
				});
			}
		}
	}

	const result: QuickEatResult = {
		cargo: {
			id: cargoAfter?.id ?? cargoItem.id,
			name: cargoAfter?.name ?? cargoItem.name,
			quantity: cargoAfter?.quantity ?? cargoItem.quantity,
			unit: cargoAfter?.unit ?? cargoItem.unit,
		},
		provision: {
			id: ensured.provision.id,
			alreadyExisted: ensured.alreadyExisted,
			normalized: ensured.normalized,
		},
		entry: {
			id: cookResult.entry.id,
			planId: cookResult.planId,
			date: cookResult.entry.date,
			slotType: cookResult.entry.slotType,
			cookedAt: cookResult.entry.cookedAt,
		},
		cookServings,
		requestedQuantity: requestedInCargoUnit,
		deductedQuantity,
		stockWasShort,
		intakeLogged,
		intakeSkipReason,
		intakeServings,
	};

	await storeCachedResult(env.RATION_KV, cacheKey, result);
	return result;
}
