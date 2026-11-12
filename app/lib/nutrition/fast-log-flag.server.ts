import { data } from "react-router";
import {
	assertFeatureEnabled,
	FEATURE_DISABLED_CODE,
} from "~/lib/feature-flags/assert-enabled.server";
import type { FlagshipEvaluationContext } from "~/lib/feature-flags/context.server";
import { isFeatureEnabled } from "~/lib/feature-flags/flags.server";
import {
	NUTRITION_FAST_LOG_IOS_MIN,
	nutritionFastLogClientAllowed,
	PLAN_FUEL_ACTIONS_IOS_MIN,
	planFuelActionsClientAllowed,
} from "./fuel-capture";

export {
	NUTRITION_FAST_LOG_IOS_MIN,
	nutritionFastLogClientAllowed,
	PLAN_FUEL_ACTIONS_IOS_MIN,
	planFuelActionsClientAllowed,
};

export async function isNutritionFastLogEnabled(
	env: Env,
	context: FlagshipEvaluationContext,
): Promise<boolean> {
	if (!nutritionFastLogClientAllowed(context)) return false;
	return isFeatureEnabled(env, "nutrition-fast-log", context);
}

export async function assertNutritionFastLog(
	env: Env,
	context: FlagshipEvaluationContext,
): Promise<void> {
	if (!nutritionFastLogClientAllowed(context)) {
		throw data(
			{
				error: "Personal food log requires iOS 1.6 or later.",
				code: FEATURE_DISABLED_CODE,
			},
			{ status: 403 },
		);
	}
	await assertFeatureEnabled(
		env,
		"nutrition-fast-log",
		context,
		"Personal food log is unavailable.",
	);
}

/** Child of nutrition-fast-log. Off when the parent is off, and iOS below 1.6 fails closed. */
export async function isNutritionSavedFoodEnabled(
	env: Env,
	context: FlagshipEvaluationContext,
): Promise<boolean> {
	if (!nutritionFastLogClientAllowed(context)) return false;
	const [parent, child] = await Promise.all([
		isFeatureEnabled(env, "nutrition-fast-log", context),
		isFeatureEnabled(env, "nutrition-saved-food", context),
	]);
	return parent && child;
}

export async function assertNutritionSavedFood(
	env: Env,
	context: FlagshipEvaluationContext,
): Promise<void> {
	if (!nutritionFastLogClientAllowed(context)) {
		throw data(
			{
				error: "Saved foods require iOS 1.6 or later.",
				code: FEATURE_DISABLED_CODE,
			},
			{ status: 403 },
		);
	}
	if (!(await isFeatureEnabled(env, "nutrition-fast-log", context))) {
		throw data(
			{
				error: "Personal food log is unavailable.",
				code: FEATURE_DISABLED_CODE,
			},
			{ status: 403 },
		);
	}
	await assertFeatureEnabled(
		env,
		"nutrition-saved-food",
		context,
		"Saved foods are unavailable.",
	);
}

async function isNutritionChildEnabled(
	env: Env,
	context: FlagshipEvaluationContext,
	flag:
		| "nutrition-barcode-diary"
		| "nutrition-photo-log"
		| "nutrition-health-export"
		| "nutrition-fuel-page",
): Promise<boolean> {
	if (!nutritionFastLogClientAllowed(context)) return false;
	const [parent, child] = await Promise.all([
		isFeatureEnabled(env, "nutrition-fast-log", context),
		isFeatureEnabled(env, flag, context),
	]);
	return parent && child;
}

async function assertNutritionChild(
	env: Env,
	context: FlagshipEvaluationContext,
	flag:
		| "nutrition-barcode-diary"
		| "nutrition-photo-log"
		| "nutrition-health-export"
		| "nutrition-fuel-page",
	unavailable: string,
): Promise<void> {
	if (!nutritionFastLogClientAllowed(context)) {
		throw data(
			{
				error: "Personal food log requires iOS 1.6 or later.",
				code: FEATURE_DISABLED_CODE,
			},
			{ status: 403 },
		);
	}
	if (!(await isFeatureEnabled(env, "nutrition-fast-log", context))) {
		throw data(
			{
				error: "Personal food log is unavailable.",
				code: FEATURE_DISABLED_CODE,
			},
			{ status: 403 },
		);
	}
	await assertFeatureEnabled(env, flag, context, unavailable);
}

export function isNutritionBarcodeDiaryEnabled(
	env: Env,
	context: FlagshipEvaluationContext,
): Promise<boolean> {
	return isNutritionChildEnabled(env, context, "nutrition-barcode-diary");
}

export function assertNutritionBarcodeDiary(
	env: Env,
	context: FlagshipEvaluationContext,
): Promise<void> {
	return assertNutritionChild(
		env,
		context,
		"nutrition-barcode-diary",
		"Barcode food log is unavailable.",
	);
}

export function isNutritionPhotoLogEnabled(
	env: Env,
	context: FlagshipEvaluationContext,
): Promise<boolean> {
	return isNutritionChildEnabled(env, context, "nutrition-photo-log");
}

export function assertNutritionPhotoLog(
	env: Env,
	context: FlagshipEvaluationContext,
): Promise<void> {
	return assertNutritionChild(
		env,
		context,
		"nutrition-photo-log",
		"Photo food log is unavailable.",
	);
}

export function isNutritionHealthExportEnabled(
	env: Env,
	context: FlagshipEvaluationContext,
): Promise<boolean> {
	return isNutritionChildEnabled(env, context, "nutrition-health-export");
}

export function assertNutritionHealthExport(
	env: Env,
	context: FlagshipEvaluationContext,
): Promise<void> {
	return assertNutritionChild(
		env,
		context,
		"nutrition-health-export",
		"Apple Health export is unavailable.",
	);
}

/** On only when nutrition-fast-log is on. iOS below 1.6.0 fails closed. */
export function isNutritionFuelPageEnabled(
	env: Env,
	context: FlagshipEvaluationContext,
): Promise<boolean> {
	return isNutritionChildEnabled(env, context, "nutrition-fuel-page");
}

export function assertNutritionFuelPage(
	env: Env,
	context: FlagshipEvaluationContext,
): Promise<void> {
	return assertNutritionChild(
		env,
		context,
		"nutrition-fuel-page",
		"Fuel is unavailable.",
	);
}

/** Parents nutrition-fast-log and nutrition-fuel-page must be on. iOS below 1.6.16 fails closed. */
export async function isPlanFuelActionsEnabled(
	env: Env,
	context: FlagshipEvaluationContext,
): Promise<boolean> {
	if (!planFuelActionsClientAllowed(context)) return false;
	if (!nutritionFastLogClientAllowed(context)) return false;
	const [fastLog, fuelPage, actions] = await Promise.all([
		isFeatureEnabled(env, "nutrition-fast-log", context),
		isFeatureEnabled(env, "nutrition-fuel-page", context),
		isFeatureEnabled(env, "plan-fuel-actions", context),
	]);
	return fastLog && fuelPage && actions;
}

export async function assertPlanFuelActions(
	env: Env,
	context: FlagshipEvaluationContext,
): Promise<void> {
	if (!planFuelActionsClientAllowed(context)) {
		throw data(
			{
				error: "Plan and Fuel actions require iOS 1.6.16 or later.",
				code: FEATURE_DISABLED_CODE,
			},
			{ status: 403 },
		);
	}
	if (!(await isNutritionFuelPageEnabled(env, context))) {
		throw data(
			{
				error: "Fuel is unavailable.",
				code: FEATURE_DISABLED_CODE,
			},
			{ status: 403 },
		);
	}
	await assertFeatureEnabled(
		env,
		"plan-fuel-actions",
		context,
		"Plan and Fuel actions are unavailable.",
	);
}
