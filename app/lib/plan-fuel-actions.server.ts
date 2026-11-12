/**
 * Cargo plan lines and Fuel logs that do not create a Manifest meal row.
 * Callers must already have confirmed `plan-fuel-actions` is on.
 */

import { and, eq, gte, isNull, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { data } from "react-router";
import { cargo, manifestCargoLine, meal, nutritionIntake } from "~/db/schema";
import {
	applyCargoDeductions,
	buildCargoDeductionStatements,
} from "~/lib/cargo-deduction.server";
import { applyUndoRecord } from "~/lib/cook-reversal.server";
import type { FlagshipEvaluationContext } from "~/lib/feature-flags/context.server";
import { ensureMealPlan } from "~/lib/manifest.server";
import { getMealMissingIngredients } from "~/lib/matching.server";
import { cookMeal } from "~/lib/meals.server";
import { scaleCargoEatMacros } from "~/lib/nutrition/cargo-eat-macros";
import { logDiaryFood } from "~/lib/nutrition/diary.server";
import { toIsoDateString } from "~/lib/nutrition/dto.server";
import { scaleNutrientValues } from "~/lib/nutrition/scale-nutrients";
import type { NutritionPrincipal } from "~/lib/nutrition/service.server";
import type { NutrientValues } from "~/lib/nutrition/types";
import type { DiaryFoodWrite } from "~/lib/schemas/diary";
import { SLOT_TYPES } from "~/lib/schemas/manifest";
import { tryStoreUndoToken } from "~/lib/undo-token.server";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type CargoLineWire = {
	id: string;
	planId: string;
	cargoId: string;
	cargoName: string;
	date: string;
	slotType: string;
	orderIndex: number;
	quantity: number;
	unit: string;
	notes: string | null;
	cookedAt: string | null;
};

type LineInput = {
	cargoId: string;
	date: string;
	slotType: string;
	quantity: number;
	notes?: string | null;
};

function assertLineInput(input: LineInput) {
	if (!ISO_DATE.test(input.date)) {
		throw data({ error: "Date must be YYYY-MM-DD" }, { status: 400 });
	}
	if (!(SLOT_TYPES as readonly string[]).includes(input.slotType)) {
		throw data({ error: "Unknown slot" }, { status: 400 });
	}
	if (!(input.quantity > 0) || !Number.isFinite(input.quantity)) {
		throw data(
			{ error: "Quantity must be greater than zero" },
			{ status: 400 },
		);
	}
}

function finiteMacro(value: number | null | undefined): number {
	return typeof value === "number" && Number.isFinite(value) && value > 0
		? value
		: 0;
}

type DiaryMacros = NonNullable<DiaryFoodWrite["macros"]>;

function wireQuantity(value: number): number {
	const quantity = Number(value);
	return Number.isFinite(quantity) ? quantity : 0;
}

function overrideEnergy(macros: DiaryMacros, energyKcal?: number): DiaryMacros {
	if (
		typeof energyKcal !== "number" ||
		!Number.isFinite(energyKcal) ||
		energyKcal < 0
	) {
		return macros;
	}
	return { ...macros, energyKcal };
}

type FuelWrite = Pick<
	DiaryFoodWrite,
	"operationKey" | "idempotencyKey" | "fuelTimeZone" | "occurredAt" | "notes"
> & { energyKcal?: number };

async function storeFuelActionUndo(
	env: Env,
	organizationId: string,
	userId: string,
	input: {
		deductions: { cargoId: string; quantity: number }[];
		eventIds?: string[];
		intakeId: string;
		operationId: string | undefined;
	},
): Promise<string | undefined> {
	if (!input.operationId) return undefined;
	return tryStoreUndoToken(env.RATION_KV, {
		userId,
		organizationId,
		kind: "fuel_action",
		deductions: input.deductions,
		eventIds: input.eventIds ?? [],
		intakeIds: [input.intakeId],
		operationId: input.operationId,
	});
}

/** Diary columns are required numbers. Unknown nutrients stay 0, not a fabricated food. */
function diaryMacrosFromNutrients(input: {
	energyKcal?: number | null;
	proteinG?: number | null;
	carbG?: number | null;
	fatG?: number | null;
	fiberG?: number | null;
}): DiaryMacros {
	const fiber = input.fiberG;
	return {
		energyKcal: finiteMacro(input.energyKcal),
		proteinG: finiteMacro(input.proteinG),
		carbsG: finiteMacro(input.carbG),
		fatG: finiteMacro(input.fatG),
		...(typeof fiber === "number" && Number.isFinite(fiber) && fiber >= 0
			? { fiberG: fiber }
			: {}),
	};
}

function diaryMacrosFromMealServing(
	perServing: NutrientValues | null | undefined,
	servings: number,
): DiaryMacros {
	if (!perServing) return diaryMacrosFromNutrients({});
	const scaled = scaleNutrientValues(perServing, servings);
	return diaryMacrosFromNutrients({
		energyKcal: scaled.energyKcal,
		proteinG: scaled.proteinG,
		carbG: scaled.carbG,
		fatG: scaled.fatG,
		fiberG: scaled.fiberG,
	});
}

export async function listCargoLinesForRange(
	db: D1Database,
	planId: string,
	startDate: string,
	endDate: string,
): Promise<CargoLineWire[]> {
	const d1 = drizzle(db);
	const rows = await d1
		.select({
			id: manifestCargoLine.id,
			planId: manifestCargoLine.planId,
			cargoId: manifestCargoLine.cargoId,
			cargoName: cargo.name,
			date: manifestCargoLine.date,
			slotType: manifestCargoLine.slotType,
			orderIndex: manifestCargoLine.orderIndex,
			quantity: manifestCargoLine.quantity,
			unit: manifestCargoLine.unit,
			notes: manifestCargoLine.notes,
			cookedAt: manifestCargoLine.cookedAt,
		})
		.from(manifestCargoLine)
		.innerJoin(cargo, eq(cargo.id, manifestCargoLine.cargoId))
		.where(
			and(
				eq(manifestCargoLine.planId, planId),
				gte(manifestCargoLine.date, startDate),
				lte(manifestCargoLine.date, endDate),
			),
		);
	return rows.map((row) => ({
		id: row.id,
		planId: row.planId,
		cargoId: row.cargoId,
		cargoName: row.cargoName,
		date: row.date,
		slotType: row.slotType,
		orderIndex: row.orderIndex,
		quantity: wireQuantity(row.quantity),
		unit: row.unit,
		notes: row.notes,
		cookedAt: row.cookedAt ? toIsoDateString(row.cookedAt) : null,
	}));
}

export async function addCargoLine(
	db: D1Database,
	organizationId: string,
	input: LineInput,
): Promise<CargoLineWire> {
	assertLineInput(input);
	const d1 = drizzle(db);
	const plan = await ensureMealPlan(db, organizationId);
	const [item] = await d1
		.select({
			id: cargo.id,
			name: cargo.name,
			unit: cargo.unit,
			quantity: cargo.quantity,
		})
		.from(cargo)
		.where(
			and(
				eq(cargo.id, input.cargoId),
				eq(cargo.organizationId, organizationId),
			),
		)
		.limit(1);
	if (!item) throw data({ error: "Cargo item not found" }, { status: 404 });
	const [created] = await d1
		.insert(manifestCargoLine)
		.values({
			planId: plan.id,
			cargoId: item.id,
			date: input.date,
			slotType: input.slotType,
			quantity: input.quantity,
			unit: item.unit,
			notes: input.notes ?? null,
		})
		.returning();
	if (!created)
		throw data({ error: "Could not plan that item" }, { status: 500 });
	return {
		id: created.id,
		planId: created.planId,
		cargoId: created.cargoId,
		cargoName: item.name,
		date: created.date,
		slotType: created.slotType,
		orderIndex: created.orderIndex,
		quantity: created.quantity,
		unit: created.unit,
		notes: created.notes,
		cookedAt: null,
	};
}

export async function updateCargoLine(
	db: D1Database,
	organizationId: string,
	lineId: string,
	input: Partial<LineInput>,
): Promise<CargoLineWire> {
	const d1 = drizzle(db);
	const plan = await ensureMealPlan(db, organizationId);
	const [current] = await d1
		.select()
		.from(manifestCargoLine)
		.where(
			and(
				eq(manifestCargoLine.id, lineId),
				eq(manifestCargoLine.planId, plan.id),
			),
		)
		.limit(1);
	if (!current) throw data({ error: "Plan line not found" }, { status: 404 });
	const next = {
		date: input.date ?? current.date,
		slotType: input.slotType ?? current.slotType,
		quantity: input.quantity ?? current.quantity,
		notes: input.notes === undefined ? current.notes : input.notes,
	};
	assertLineInput({
		cargoId: current.cargoId,
		date: next.date,
		slotType: next.slotType,
		quantity: next.quantity,
	});
	await d1
		.update(manifestCargoLine)
		.set({
			date: next.date,
			slotType: next.slotType,
			quantity: next.quantity,
			notes: next.notes,
		})
		.where(eq(manifestCargoLine.id, current.id));
	const [named] = await d1
		.select({ name: cargo.name })
		.from(cargo)
		.where(eq(cargo.id, current.cargoId))
		.limit(1);
	return {
		id: current.id,
		planId: current.planId,
		cargoId: current.cargoId,
		cargoName: named?.name ?? "Item",
		date: next.date,
		slotType: next.slotType,
		orderIndex: current.orderIndex,
		quantity: next.quantity,
		unit: current.unit,
		notes: next.notes,
		cookedAt: current.cookedAt ? toIsoDateString(current.cookedAt) : null,
	};
}

export async function deleteCargoLine(
	db: D1Database,
	organizationId: string,
	lineId: string,
): Promise<boolean> {
	const d1 = drizzle(db);
	const plan = await ensureMealPlan(db, organizationId);
	const result = await d1
		.delete(manifestCargoLine)
		.where(
			and(
				eq(manifestCargoLine.id, lineId),
				eq(manifestCargoLine.planId, plan.id),
			),
		);
	return (result.meta?.changes ?? 0) > 0;
}

export async function cookCargoLine(
	db: D1Database,
	organizationId: string,
	userId: string,
	lineId: string,
): Promise<{ cooked: boolean; alreadyCooked: boolean; line: CargoLineWire }> {
	const d1 = drizzle(db);
	const plan = await ensureMealPlan(db, organizationId);
	const [current] = await d1
		.select({
			line: manifestCargoLine,
			cargoName: cargo.name,
			cargoQuantity: cargo.quantity,
		})
		.from(manifestCargoLine)
		.innerJoin(cargo, eq(cargo.id, manifestCargoLine.cargoId))
		.where(
			and(
				eq(manifestCargoLine.id, lineId),
				eq(manifestCargoLine.planId, plan.id),
				eq(cargo.organizationId, organizationId),
			),
		)
		.limit(1);
	if (!current) throw data({ error: "Plan line not found" }, { status: 404 });
	const wire = (cookedAt: Date | null): CargoLineWire => ({
		id: current.line.id,
		planId: current.line.planId,
		cargoId: current.line.cargoId,
		cargoName: current.cargoName,
		date: current.line.date,
		slotType: current.line.slotType,
		orderIndex: current.line.orderIndex,
		quantity: wireQuantity(current.line.quantity),
		unit: current.line.unit,
		notes: current.line.notes,
		cookedAt: cookedAt ? toIsoDateString(cookedAt) : null,
	});
	if (current.line.cookedAt) {
		return {
			cooked: false,
			alreadyCooked: true,
			line: wire(current.line.cookedAt),
		};
	}
	const now = new Date();
	const stmts = await buildCargoDeductionStatements(d1, organizationId, [
		{ cargoId: current.line.cargoId, quantity: current.line.quantity },
	]);
	if (stmts.length === 0) {
		throw data(
			{ error: "Cargo item is not available to cook" },
			{ status: 409 },
		);
	}
	stmts.push(
		d1
			.update(manifestCargoLine)
			.set({ cookedAt: now, cookedByUserId: userId })
			.where(
				and(
					eq(manifestCargoLine.id, current.line.id),
					isNull(manifestCargoLine.cookedAt),
				),
			),
	);
	// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types are complex
	await d1.batch(stmts as [any, ...any[]]);
	return { cooked: true, alreadyCooked: false, line: wire(now) };
}

export async function addCargoToFuel(
	env: Env,
	organizationId: string,
	cargoId: string,
	quantity: number,
	principal: NutritionPrincipal,
	flags: FlagshipEvaluationContext,
	write: FuelWrite,
): Promise<{ intakeId: string; deducted: number; undoToken?: string }> {
	if (!(quantity > 0) || !Number.isFinite(quantity)) {
		throw data(
			{ error: "Quantity must be greater than zero" },
			{ status: 400 },
		);
	}
	const d1 = drizzle(env.DB);
	const [item] = await d1
		.select()
		.from(cargo)
		.where(and(eq(cargo.id, cargoId), eq(cargo.organizationId, organizationId)))
		.limit(1);
	if (!item) throw data({ error: "Cargo item not found" }, { status: 404 });
	const before = item.quantity;
	const deduct = await buildCargoDeductionStatements(d1, organizationId, [
		{ cargoId: item.id, quantity },
	]);
	if (deduct.length === 0) {
		throw data({ error: "That amount is not in Cargo" }, { status: 409 });
	}
	// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types are complex
	await d1.batch(deduct as [any, ...any[]]);
	try {
		const scaled = scaleCargoEatMacros({
			nutrition: item.nutrition,
			quantity,
			unit: item.unit,
			packageQuantity: before,
		});
		const logged = await logDiaryFood(env, principal, flags, {
			name: item.name,
			amount: quantity,
			unit: item.unit,
			macros: overrideEnergy(
				diaryMacrosFromNutrients({
					energyKcal: scaled.energyKcal,
					proteinG: scaled.proteinG,
					carbG: scaled.carbG,
					fatG: scaled.fatG,
				}),
				write.energyKcal,
			),
			compositionSource: "manual_macros",
			notes: write.notes,
			operationKey: write.operationKey,
			idempotencyKey: write.idempotencyKey,
			fuelTimeZone: write.fuelTimeZone,
			occurredAt: write.occurredAt,
		});
		const undoToken = await storeFuelActionUndo(
			env,
			organizationId,
			principal.userId,
			{
				deductions: [{ cargoId: item.id, quantity }],
				intakeId: logged.intakeId,
				operationId: logged.operationId,
			},
		);
		return {
			intakeId: logged.intakeId,
			deducted: quantity,
			...(undoToken ? { undoToken } : {}),
		};
	} catch (error) {
		const [after] = await d1
			.select({ quantity: cargo.quantity })
			.from(cargo)
			.where(eq(cargo.id, item.id))
			.limit(1);
		const restore = before - (after?.quantity ?? before);
		if (restore > 0) {
			await applyCargoDeductions(
				env.DB,
				organizationId,
				[{ cargoId: item.id, quantity: restore }],
				{ sign: 1 },
			);
		}
		throw error;
	}
}

async function undoGalleyCook(
	env: Env,
	organizationId: string,
	userId: string,
	cooked: {
		deductions: { cargoId: string; quantity: number }[];
		eventIds: string[];
	},
): Promise<void> {
	await applyUndoRecord(
		env.DB,
		organizationId,
		{
			kind: "cook",
			userId,
			deductions: cooked.deductions,
			eventIds: cooked.eventIds,
		},
		{ kv: env.RATION_KV },
	);
}

export async function addMealToFuel(
	env: Env,
	organizationId: string,
	mealId: string,
	servings: number,
	confirmInsufficient: boolean,
	principal: NutritionPrincipal,
	flags: FlagshipEvaluationContext,
	write: FuelWrite,
): Promise<
	| {
			requiresConfirmation: true;
			missingIngredients: Awaited<ReturnType<typeof getMealMissingIngredients>>;
	  }
	| {
			requiresConfirmation: false;
			intakeId: string;
			mealId: string;
			undoToken?: string;
	  }
> {
	if (!(servings > 0) || !Number.isFinite(servings)) {
		throw data(
			{ error: "Servings must be greater than zero" },
			{ status: 400 },
		);
	}
	const missing = await getMealMissingIngredients(
		env,
		organizationId,
		mealId,
		servings,
	);
	if (missing.length > 0 && !confirmInsufficient) {
		return { requiresConfirmation: true, missingIngredients: missing };
	}
	const cooked = await cookMeal(env, organizationId, mealId, {
		servings,
		deductionMode: confirmInsufficient ? "partial" : "strict",
		userId: principal.userId,
		source: "mobile",
	});
	const d1 = drizzle(env.DB);
	const [row] = await d1
		.select({
			id: meal.id,
			name: meal.name,
			nutrition: meal.nutrition,
		})
		.from(meal)
		.where(and(eq(meal.id, mealId), eq(meal.organizationId, organizationId)))
		.limit(1);
	if (!row) {
		await undoGalleyCook(env, organizationId, principal.userId, cooked);
		throw data({ error: "Meal not found" }, { status: 404 });
	}
	let logged: Awaited<ReturnType<typeof logDiaryFood>>;
	try {
		logged = await logDiaryFood(env, principal, flags, {
			name: row.name,
			amount: servings,
			unit: "serving",
			macros: overrideEnergy(
				diaryMacrosFromMealServing(row.nutrition?.perServing, servings),
				write.energyKcal,
			),
			compositionSource: "meal",
			notes: write.notes,
			operationKey: write.operationKey,
			idempotencyKey: write.idempotencyKey,
			fuelTimeZone: write.fuelTimeZone,
			occurredAt: write.occurredAt,
		});
	} catch (error) {
		await undoGalleyCook(env, organizationId, principal.userId, cooked);
		throw error;
	}
	await d1
		.update(nutritionIntake)
		.set({ mealId: row.id })
		.where(eq(nutritionIntake.id, logged.intakeId));
	const undoToken = await storeFuelActionUndo(
		env,
		organizationId,
		principal.userId,
		{
			deductions: cooked.deductions,
			eventIds: cooked.eventIds,
			intakeId: logged.intakeId,
			operationId: logged.operationId,
		},
	);
	return {
		requiresConfirmation: false,
		intakeId: logged.intakeId,
		mealId: row.id,
		...(undoToken ? { undoToken } : {}),
	};
}
