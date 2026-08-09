/**
 * Private intake logging — user-scoped, never mutates Cargo or shared events.
 * Dark behind `nutrition-cook-log-split` + `nutrition-manifest` + consent.
 */
export type LogManifestNutritionIntakeResult = {
	intakes: Array<{ id: string; entryId: string | null; servings: number }>;
	idempotent: boolean;
};

export async function logManifestNutritionIntake(
	_env: Env,
	_input: {
		organizationId: string;
		userId: string;
		planId: string;
		portions: Array<{ entryId: string; servings: number }>;
		idempotencyKey: string;
		operationId?: string;
		occurredAt?: Date;
	},
): Promise<LogManifestNutritionIntakeResult> {
	throw new Error(
		"logManifestNutritionIntake is not enabled — enable nutrition-cook-log-split with intake consent",
	);
}
