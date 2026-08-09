import { and, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "~/db/schema";

export const NUTRITION_CONSENT_POLICY_VERSION = "2026-08-01";

export type NutritionConsentPurpose = "goals" | "intake" | "healthkit";
export type NutritionConsentSource = "web" | "mobile" | "mcp" | "copilot";

export type NutritionConsentRow = typeof schema.nutritionConsent.$inferSelect;

export async function getActiveNutritionConsent(
	db: D1Database,
	userId: string,
	purpose: NutritionConsentPurpose,
	policyVersion: string = NUTRITION_CONSENT_POLICY_VERSION,
): Promise<NutritionConsentRow | null> {
	const d1 = drizzle(db, { schema });
	const [row] = await d1
		.select()
		.from(schema.nutritionConsent)
		.where(
			and(
				eq(schema.nutritionConsent.userId, userId),
				eq(schema.nutritionConsent.purpose, purpose),
				eq(schema.nutritionConsent.policyVersion, policyVersion),
				isNull(schema.nutritionConsent.withdrawnAt),
			),
		)
		.limit(1);
	return row ?? null;
}

/**
 * Server-stamped grant. Concurrent grants for the same active purpose are
 * idempotent — returns the existing active row when present.
 */
export async function grantNutritionConsent(
	db: D1Database,
	input: {
		userId: string;
		purpose: NutritionConsentPurpose;
		source: NutritionConsentSource;
		policyVersion?: string;
		now?: Date;
	},
): Promise<NutritionConsentRow> {
	const policyVersion = input.policyVersion ?? NUTRITION_CONSENT_POLICY_VERSION;
	const existing = await getActiveNutritionConsent(
		db,
		input.userId,
		input.purpose,
		policyVersion,
	);
	if (existing) return existing;

	const d1 = drizzle(db, { schema });
	const now = input.now ?? new Date();
	const id = crypto.randomUUID();
	await d1.insert(schema.nutritionConsent).values({
		id,
		userId: input.userId,
		purpose: input.purpose,
		policyVersion,
		source: input.source,
		grantedAt: now,
		withdrawnAt: null,
		createdAt: now,
	});

	const [row] = await d1
		.select()
		.from(schema.nutritionConsent)
		.where(eq(schema.nutritionConsent.id, id))
		.limit(1);
	if (!row) throw new Error("Failed to grant nutrition consent");
	return row;
}

export async function withdrawNutritionConsent(
	db: D1Database,
	userId: string,
	purpose: NutritionConsentPurpose,
	now = new Date(),
): Promise<number> {
	const d1 = drizzle(db, { schema });
	const result = await d1
		.update(schema.nutritionConsent)
		.set({ withdrawnAt: now })
		.where(
			and(
				eq(schema.nutritionConsent.userId, userId),
				eq(schema.nutritionConsent.purpose, purpose),
				isNull(schema.nutritionConsent.withdrawnAt),
			),
		);
	return result.meta?.changes ?? 0;
}

export class NutritionConsentRequiredError extends Error {
	readonly code = "nutrition_consent_required" as const;
	constructor(purpose: NutritionConsentPurpose) {
		super(`Active nutrition consent required for purpose: ${purpose}`);
		this.name = "NutritionConsentRequiredError";
	}
}

export async function assertNutritionConsent(
	db: D1Database,
	userId: string,
	purpose: NutritionConsentPurpose,
	policyVersion: string = NUTRITION_CONSENT_POLICY_VERSION,
): Promise<NutritionConsentRow> {
	const row = await getActiveNutritionConsent(
		db,
		userId,
		purpose,
		policyVersion,
	);
	if (!row) throw new NutritionConsentRequiredError(purpose);
	return row;
}
