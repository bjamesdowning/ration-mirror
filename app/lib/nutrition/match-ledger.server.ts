/**
 * Org-scoped durable decisions for ingredient → FDC matches.
 */
import { and, eq, gt, isNull, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "~/db/schema";
import {
	NUTRITION_DATASET_SNAPSHOT_ID,
	NUTRITION_MATCHER_VERSION,
	NUTRITION_ORG_MATCH_HIT_TTL_MS,
	NUTRITION_ORG_MATCH_MISS_TTL_MS,
} from "./constants";
import type { NutritionMatchQuality } from "./types";

export type MatchLedgerDecision = {
	fdcId: number | null;
	description: string | null;
	resolutionKind: string | null;
	decisionSource: string | null;
	matchQuality: NutritionMatchQuality | null;
	matchScore: number | null;
	scoreMargin: number | null;
	matcherVersion: string | null;
	datasetSnapshotId: string | null;
	reviewedByUserId: string | null;
};

export type UpsertMatchLedgerInput = {
	organizationId: string;
	normalizedName: string;
	fdcId: number | null;
	description: string | null;
	resolutionKind: "hit" | "miss" | "review";
	decisionSource: "automatic" | "user" | "barcode";
	matchQuality: NutritionMatchQuality | null;
	matchScore: number | null;
	scoreMargin: number | null;
	reviewedByUserId?: string | null;
	now?: Date;
};

function isUserDecision(source: string | null): boolean {
	return source === "user" || source === "barcode";
}

function versionCompatible(row: {
	matcherVersion: string | null;
	datasetSnapshotId: string | null;
	decisionSource: string | null;
}): boolean {
	if (isUserDecision(row.decisionSource)) return true;
	if (row.matcherVersion !== NUTRITION_MATCHER_VERSION) return false;
	if (row.datasetSnapshotId !== NUTRITION_DATASET_SNAPSHOT_ID) return false;
	return true;
}

/**
 * Read a non-expired org match decision. Automatic rows expire; user rows do not.
 * Version/snapshot mismatch invalidates automatic rows.
 */
export async function readOrgMatchDecision(
	env: Env,
	organizationId: string,
	normalizedName: string,
	now = new Date(),
): Promise<MatchLedgerDecision | null> {
	const db = drizzle(env.DB, { schema });
	const [row] = await db
		.select()
		.from(schema.ingredientNutritionMatch)
		.where(
			and(
				eq(schema.ingredientNutritionMatch.organizationId, organizationId),
				eq(schema.ingredientNutritionMatch.normalizedName, normalizedName),
				or(
					isNull(schema.ingredientNutritionMatch.expiresAt),
					gt(schema.ingredientNutritionMatch.expiresAt, now),
				),
			),
		)
		.limit(1);

	if (!row) return null;
	if (!versionCompatible(row)) return null;

	return {
		fdcId: row.fdcId,
		description: row.description,
		resolutionKind: row.resolutionKind,
		decisionSource: row.decisionSource,
		matchQuality: (row.matchQuality as NutritionMatchQuality | null) ?? null,
		matchScore: row.matchScore,
		scoreMargin: row.scoreMargin,
		matcherVersion: row.matcherVersion,
		datasetSnapshotId: row.datasetSnapshotId,
		reviewedByUserId: row.reviewedByUserId,
	};
}

/** Upsert an org match decision with TTL rules from the release plan. */
export async function upsertOrgMatchDecision(
	env: Env,
	input: UpsertMatchLedgerInput,
): Promise<void> {
	const now = input.now ?? new Date();
	const isUser =
		input.decisionSource === "user" || input.decisionSource === "barcode";
	let expiresAt: Date | null = null;
	if (!isUser) {
		const ttl =
			input.resolutionKind === "miss"
				? NUTRITION_ORG_MATCH_MISS_TTL_MS
				: NUTRITION_ORG_MATCH_HIT_TTL_MS;
		expiresAt = new Date(now.getTime() + ttl);
	}

	const db = drizzle(env.DB, { schema });
	const confidence =
		input.matchQuality === "verified" || input.matchQuality === "high"
			? 0.95
			: input.matchQuality === "medium"
				? 0.7
				: input.fdcId == null
					? 0
					: 0.4;

	await db
		.insert(schema.ingredientNutritionMatch)
		.values({
			organizationId: input.organizationId,
			normalizedName: input.normalizedName,
			fdcId: input.fdcId,
			description: input.description,
			source: input.decisionSource,
			confidence,
			resolutionKind: input.resolutionKind,
			decisionSource: input.decisionSource,
			matchQuality: input.matchQuality,
			matchScore: input.matchScore,
			scoreMargin: input.scoreMargin,
			matcherVersion: NUTRITION_MATCHER_VERSION,
			datasetSnapshotId: NUTRITION_DATASET_SNAPSHOT_ID,
			expiresAt,
			reviewedByUserId: input.reviewedByUserId ?? null,
			reviewedAt: isUser ? now : null,
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			target: [
				schema.ingredientNutritionMatch.organizationId,
				schema.ingredientNutritionMatch.normalizedName,
			],
			set: {
				fdcId: input.fdcId,
				description: input.description,
				source: input.decisionSource,
				confidence,
				resolutionKind: input.resolutionKind,
				decisionSource: input.decisionSource,
				matchQuality: input.matchQuality,
				matchScore: input.matchScore,
				scoreMargin: input.scoreMargin,
				matcherVersion: NUTRITION_MATCHER_VERSION,
				datasetSnapshotId: NUTRITION_DATASET_SNAPSHOT_ID,
				expiresAt,
				reviewedByUserId: input.reviewedByUserId ?? null,
				reviewedAt: isUser ? now : null,
				updatedAt: now,
			},
		});
}
