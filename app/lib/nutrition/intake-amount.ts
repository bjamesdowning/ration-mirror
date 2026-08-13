/**
 * Shared Eat intake amount math — isomorphic (web, iOS-adjacent TS, MCP, HTTP).
 *
 * Canonical storage remains `nutrition_intake.servings` (scale factor on
 * per-serving nutrients). Callers may enter servings or a mass amount+unit.
 */

import { convertQuantity } from "~/lib/units";

export const INTAKE_SERVINGS_MIN = 0.01;
export const INTAKE_SERVINGS_MAX = 100;
export const INTAKE_SERVINGS_DECIMALS = 4;
export const INTAKE_GRAMS_DECIMALS = 1;
export const INTAKE_OZ_DECIMALS = 2;
export const INTAKE_AMOUNT_MATCH_EPSILON = 1e-4;
/** Hide gram/oz mode for tiny recipe servings (a garnish, not a plate). */
export const MIN_GRAMS_PER_SERVING_FOR_MASS_UNIT = 10;

export const INTAKE_LOGGED_UNITS = ["serving", "g", "oz"] as const;
export type IntakeLoggedUnit = (typeof INTAKE_LOGGED_UNITS)[number];

export const INTAKE_PORTION_PRESETS = [
	{ value: 0.25, label: "¼" },
	{ value: 1 / 3, label: "⅓" },
	{ value: 0.5, label: "½" },
	{ value: 0.75, label: "¾" },
	{ value: 1, label: "1" },
	{ value: 1.5, label: "1½" },
	{ value: 2, label: "2" },
] as const;

export type IntakeAmountInput = {
	servings?: number | null;
	amount?: number | null;
	unit?: IntakeLoggedUnit | "servings" | null;
};

export type ResolveIntakeAmountOk = {
	ok: true;
	servings: number;
	loggedAmount: number;
	loggedUnit: IntakeLoggedUnit;
};

export type IntakeAmountErrorCode =
	| "missing_amount"
	| "invalid_servings"
	| "invalid_amount"
	| "amount_unit_unavailable"
	| "amount_servings_mismatch";

export type ResolveIntakeAmountError = {
	ok: false;
	code: IntakeAmountErrorCode;
	message: string;
};

export type ResolveIntakeAmountResult =
	| ResolveIntakeAmountOk
	| ResolveIntakeAmountError;

export type RecipeMassSnapshot = {
	recipeMassG?: number | null;
	attributions?: Array<{ grams: number | null }>;
};

export function roundTo(value: number, decimals: number): number {
	if (!Number.isFinite(value)) return value;
	const factor = 10 ** decimals;
	return Math.round(value * factor) / factor;
}

export function normalizeIntakeServings(value: number): number {
	return roundTo(value, INTAKE_SERVINGS_DECIMALS);
}

export function isIntakeServingsInRange(value: number): boolean {
	return (
		Number.isFinite(value) &&
		value >= INTAKE_SERVINGS_MIN &&
		value <= INTAKE_SERVINGS_MAX
	);
}

export function coerceIntakeLoggedUnit(
	value: string | null | undefined,
): IntakeLoggedUnit | null {
	if (value === "serving" || value === "g" || value === "oz") return value;
	if (value === "servings") return "serving";
	return null;
}

export function normalizeIntakeLoggedUnit(
	unit: IntakeAmountInput["unit"],
): IntakeLoggedUnit | null {
	return coerceIntakeLoggedUnit(unit);
}

export function massUnitForDisplayMode(
	mode: string | null | undefined,
): "g" | "oz" {
	return mode === "imperial" ? "oz" : "g";
}

export function canLogIntakeByMass(
	gramsPerServing: number | null | undefined,
): boolean {
	return (
		gramsPerServing != null &&
		Number.isFinite(gramsPerServing) &&
		gramsPerServing >= MIN_GRAMS_PER_SERVING_FOR_MASS_UNIT
	);
}

export function recipeMassGFromSnapshot(
	snapshot: RecipeMassSnapshot | null | undefined,
): number | null {
	if (!snapshot) return null;
	const stored = snapshot.recipeMassG;
	if (stored != null && Number.isFinite(stored) && stored > 0) {
		return stored;
	}
	const grams = (snapshot.attributions ?? [])
		.map((row) => row.grams)
		.filter((g): g is number => g != null && Number.isFinite(g) && g > 0);
	if (grams.length === 0) return null;
	return grams.reduce((sum, g) => sum + g, 0);
}

export function gramsPerServingFromRecipe(
	recipeMassG: number | null | undefined,
	mealServings: number,
): number | null {
	if (
		recipeMassG == null ||
		!Number.isFinite(recipeMassG) ||
		recipeMassG <= 0
	) {
		return null;
	}
	if (!Number.isFinite(mealServings) || mealServings <= 0) return null;
	const gramsPerServing = recipeMassG / mealServings;
	if (!Number.isFinite(gramsPerServing) || gramsPerServing <= 0) return null;
	return gramsPerServing;
}

export function gramsPerServingFromSnapshot(
	snapshot: RecipeMassSnapshot | null | undefined,
	mealServings: number,
): number | null {
	return gramsPerServingFromRecipe(
		recipeMassGFromSnapshot(snapshot),
		mealServings,
	);
}

export function gramsFromLoggedMass(
	amount: number,
	unit: Exclude<IntakeLoggedUnit, "serving">,
): number | null {
	if (!Number.isFinite(amount) || amount <= 0) return null;
	if (unit === "g") return amount;
	return convertQuantity(amount, "oz", "g");
}

export function amountFromServings(
	servings: number,
	unit: IntakeLoggedUnit,
	gramsPerServing: number | null,
): number | null {
	if (!Number.isFinite(servings) || servings <= 0) return null;
	if (unit === "serving") return normalizeIntakeServings(servings);
	if (!canLogIntakeByMass(gramsPerServing) || gramsPerServing == null) {
		return null;
	}
	const grams = servings * gramsPerServing;
	if (unit === "g") return roundTo(grams, INTAKE_GRAMS_DECIMALS);
	const oz = convertQuantity(grams, "g", "oz");
	if (oz == null) return null;
	return roundTo(oz, INTAKE_OZ_DECIMALS);
}

export function intakeAmountStep(unit: IntakeLoggedUnit): number {
	switch (unit) {
		case "serving":
			return 0.25;
		case "g":
			return 10;
		case "oz":
			return 0.5;
	}
}

export function roundLoggedAmount(
	amount: number,
	unit: IntakeLoggedUnit,
): number {
	if (unit === "g") return roundTo(amount, INTAKE_GRAMS_DECIMALS);
	if (unit === "oz") return roundTo(amount, INTAKE_OZ_DECIMALS);
	return normalizeIntakeServings(amount);
}

/**
 * Clamp plate-up servings to intake schema bounds (Quick Eat derived servings).
 * Does not snap to half-units.
 */
export function clampIntakeServings(cookServings: number): {
	servings: number;
	clamped: boolean;
} {
	if (!Number.isFinite(cookServings) || cookServings <= 0) {
		return { servings: INTAKE_SERVINGS_MIN, clamped: true };
	}
	const rounded = normalizeIntakeServings(cookServings);
	if (rounded < INTAKE_SERVINGS_MIN) {
		return { servings: INTAKE_SERVINGS_MIN, clamped: true };
	}
	if (rounded > INTAKE_SERVINGS_MAX) {
		return { servings: INTAKE_SERVINGS_MAX, clamped: true };
	}
	return { servings: rounded, clamped: rounded !== cookServings };
}

export function formatIntakeServings(value: number): string {
	if (!Number.isFinite(value)) return "";
	const snapped = normalizeIntakeServings(value);
	for (const preset of INTAKE_PORTION_PRESETS) {
		if (Math.abs(snapped - preset.value) < 0.005) {
			return preset.label;
		}
	}
	if (Number.isInteger(snapped)) return String(snapped);
	const trimmed = snapped.toFixed(INTAKE_SERVINGS_DECIMALS).replace(/0+$/, "");
	return trimmed.endsWith(".") ? trimmed.slice(0, -1) : trimmed;
}

export function formatLoggedIntake(
	amount: number,
	unit: IntakeLoggedUnit | null | undefined,
): string {
	const loggedUnit = unit ?? "serving";
	if (loggedUnit === "serving") {
		const label = formatIntakeServings(amount);
		const numeric = Number.parseFloat(label);
		const isOne = numeric === 1 || label === "1";
		const singular = isOne || amount < 1;
		return `${label} ${singular ? "serving" : "servings"}`;
	}
	const rounded = roundLoggedAmount(amount, loggedUnit);
	const text = Number.isInteger(rounded) ? String(rounded) : String(rounded);
	return `${text} ${loggedUnit}`;
}

export function resolveIntakeAmount(
	input: IntakeAmountInput,
	ctx: { gramsPerServing: number | null },
): ResolveIntakeAmountResult {
	const unit = normalizeIntakeLoggedUnit(input.unit);
	const hasServings = input.servings != null && Number.isFinite(input.servings);
	const hasAmount =
		input.amount != null && Number.isFinite(input.amount) && unit != null;

	if (!hasServings && !hasAmount) {
		return {
			ok: false,
			code: "missing_amount",
			message: "Provide servings or amount and unit.",
		};
	}

	if (hasAmount) {
		const amount = input.amount as number;
		if (amount <= 0) {
			return {
				ok: false,
				code: "invalid_amount",
				message: "Amount must be greater than zero.",
			};
		}

		let servings: number;
		let loggedAmount: number;
		const loggedUnit = unit as IntakeLoggedUnit;

		if (loggedUnit === "serving") {
			servings = normalizeIntakeServings(amount);
			loggedAmount = servings;
		} else {
			if (!canLogIntakeByMass(ctx.gramsPerServing)) {
				return {
					ok: false,
					code: "amount_unit_unavailable",
					message:
						"This meal has no recipe mass to log in grams or ounces. Use servings instead.",
				};
			}
			const grams = gramsFromLoggedMass(amount, loggedUnit);
			if (grams == null || grams <= 0) {
				return {
					ok: false,
					code: "invalid_amount",
					message: "Could not convert that amount to grams.",
				};
			}
			servings = normalizeIntakeServings(
				grams / (ctx.gramsPerServing as number),
			);
			loggedAmount = roundLoggedAmount(amount, loggedUnit);
		}

		if (!isIntakeServingsInRange(servings)) {
			return {
				ok: false,
				code: "invalid_servings",
				message: `Servings must be between ${INTAKE_SERVINGS_MIN} and ${INTAKE_SERVINGS_MAX}.`,
			};
		}

		if (hasServings) {
			const provided = normalizeIntakeServings(input.servings as number);
			if (Math.abs(provided - servings) > INTAKE_AMOUNT_MATCH_EPSILON) {
				return {
					ok: false,
					code: "amount_servings_mismatch",
					message:
						"servings does not match amount and unit. Send one, or make them agree.",
				};
			}
		}

		return { ok: true, servings, loggedAmount, loggedUnit };
	}

	const servings = normalizeIntakeServings(input.servings as number);
	if (!isIntakeServingsInRange(servings)) {
		return {
			ok: false,
			code: "invalid_servings",
			message: `Servings must be between ${INTAKE_SERVINGS_MIN} and ${INTAKE_SERVINGS_MAX}.`,
		};
	}
	return {
		ok: true,
		servings,
		loggedAmount: servings,
		loggedUnit: "serving",
	};
}
