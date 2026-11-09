import { nutritionFastLogClientAllowed } from "./fuel-capture";

/** Draft, pending review. The same five Nutrition Goals fields, with no suggested numbers. */
export const OPTIONAL_GOALS_DRAFT_COPY = "Enter targets you already use";

export const OPTIONAL_GOALS_NOT_MEDICAL =
	"Not medical advice. Goals and totals are planning aids only.";

/** Agents store stated numbers. They do not calculate or propose a target. */
export const OPTIONAL_GOALS_AGENT_RULE =
	"Store only numbers the person states. Do not suggest, calculate, or invent a target.";

export type OptionalGoalFields = {
	dailyEnergyKcal: string;
	proteinG: string;
	carbsG: string;
	fatG: string;
	fiberG: string;
};

export type OptionalGoalWrite = {
	dailyEnergyKcal: number | null;
	proteinG: number | null;
	carbsG: number | null;
	fatG: number | null;
	fiberG: number | null;
};

/**
 * After Macro Tracking is on. Uses nutrition-fast-log or nutrition-goals.
 * Neither flag becomes iosAlwaysOn here. iOS below 1.6 stays closed.
 */
export function optionalGoalsStepVisible(input: {
	macroTrackingOn: boolean;
	fastLogEnabled: boolean;
	goalsEnabled: boolean;
	clientPlatform?: string;
	clientVersion?: string;
}): boolean {
	if (!input.macroTrackingOn) return false;
	if (
		!nutritionFastLogClientAllowed({
			clientPlatform: input.clientPlatform,
			clientVersion: input.clientVersion,
		})
	) {
		return false;
	}
	return input.fastLogEnabled || input.goalsEnabled;
}

/** Empty fields and a goals flag that is off both write nothing. */
export function optionalGoalWrite(
	fields: OptionalGoalFields,
	goalsEnabled: boolean,
): OptionalGoalWrite | null {
	if (!goalsEnabled) return null;
	const write: OptionalGoalWrite = {
		dailyEnergyKcal: parseOptionalGoalField(fields.dailyEnergyKcal),
		proteinG: parseOptionalGoalField(fields.proteinG),
		carbsG: parseOptionalGoalField(fields.carbsG),
		fatG: parseOptionalGoalField(fields.fatG),
		fiberG: parseOptionalGoalField(fields.fiberG),
	};
	if (
		write.dailyEnergyKcal == null &&
		write.proteinG == null &&
		write.carbsG == null &&
		write.fatG == null &&
		write.fiberG == null
	) {
		return null;
	}
	return write;
}

function parseOptionalGoalField(raw: string): number | null {
	const trimmed = raw.trim();
	if (!trimmed) return null;
	const value = Number(trimmed);
	if (!Number.isFinite(value) || value < 0) return null;
	return value;
}
