import { and, eq, isNull, lt, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../../db/schema";
import { log, redactId } from "../logging.server";
import { chunkArray } from "../query-utils.server";
import { deleteR2Prefix } from "../r2-cleanup.server";
import { deleteCargoVectors } from "../vector.server";
import { AGENT_ORPHAN_INACTIVITY_MS } from "./claim.constants";

export interface OrphanEligibilityInput {
	status: "pending_claim" | "claimed";
	preClaim: boolean;
	createdAt: Date;
	lastUsedAt: Date | null;
	now?: Date;
}

/** Pure eligibility check for 6-month idle unclaimed agent kitchens. */
export function isOrphanEligible(input: OrphanEligibilityInput): boolean {
	if (input.status !== "pending_claim" || !input.preClaim) {
		return false;
	}
	const now = input.now ?? new Date();
	const cutoff = new Date(now.getTime() - AGENT_ORPHAN_INACTIVITY_MS);
	if (input.lastUsedAt) {
		return input.lastUsedAt.getTime() < cutoff.getTime();
	}
	return input.createdAt.getTime() < cutoff.getTime();
}

/**
 * Find pending_claim registrations idle for 6+ months.
 * Capped per cron run to avoid long D1 transactions.
 */
export async function findOrphanRegistrations(
	db: D1Database,
	now = new Date(),
	limit = 25,
) {
	const cutoff = new Date(now.getTime() - AGENT_ORPHAN_INACTIVITY_MS);
	const d1 = drizzle(db, { schema });

	return d1
		.select({
			registration: schema.agentRegistration,
			lastUsedAt: schema.apiKey.lastUsedAt,
		})
		.from(schema.agentRegistration)
		.innerJoin(
			schema.apiKey,
			eq(schema.apiKey.id, schema.agentRegistration.apiKeyId),
		)
		.where(
			and(
				eq(schema.agentRegistration.status, "pending_claim"),
				eq(schema.agentRegistration.preClaim, true),
				or(
					and(
						isNull(schema.apiKey.lastUsedAt),
						lt(schema.agentRegistration.createdAt, cutoff),
					),
					lt(schema.apiKey.lastUsedAt, cutoff),
				),
			),
		)
		.limit(limit);
}

/** Purge one orphan stub kitchen and all org-scoped data (aligned with user/purge). */
export async function purgeOrphanKitchen(
	env: Cloudflare.Env,
	registration: typeof schema.agentRegistration.$inferSelect,
): Promise<void> {
	const db = drizzle(env.DB, { schema });
	const orgId = registration.organizationId;
	const userId = registration.userId;

	await db
		.update(schema.session)
		.set({ activeOrganizationId: null })
		.where(eq(schema.session.activeOrganizationId, orgId));

	await db
		.delete(schema.queueJob)
		.where(eq(schema.queueJob.organizationId, orgId));

	const cargoRows = await db
		.select({ id: schema.cargo.id })
		.from(schema.cargo)
		.where(eq(schema.cargo.organizationId, orgId));
	const cargoIds = cargoRows.map((r) => r.id);
	if (cargoIds.length > 0) {
		for (const chunk of chunkArray(cargoIds, 500)) {
			await deleteCargoVectors(env, chunk);
		}
	}

	await db.batch([
		db.delete(schema.cargo).where(eq(schema.cargo.organizationId, orgId)),
		db.delete(schema.meal).where(eq(schema.meal.organizationId, orgId)),
		db
			.delete(schema.activeMealSelection)
			.where(eq(schema.activeMealSelection.organizationId, orgId)),
		db
			.delete(schema.supplyList)
			.where(eq(schema.supplyList.organizationId, orgId)),
		db
			.delete(schema.supplySnooze)
			.where(eq(schema.supplySnooze.organizationId, orgId)),
		db.delete(schema.mealPlan).where(eq(schema.mealPlan.organizationId, orgId)),
		db.delete(schema.ledger).where(eq(schema.ledger.organizationId, orgId)),
		db
			.delete(schema.invitation)
			.where(eq(schema.invitation.organizationId, orgId)),
		db
			.delete(schema.agentRegistration)
			.where(eq(schema.agentRegistration.id, registration.id)),
		db.delete(schema.apiKey).where(eq(schema.apiKey.id, registration.apiKeyId)),
		db.delete(schema.member).where(eq(schema.member.organizationId, orgId)),
		db.delete(schema.organization).where(eq(schema.organization.id, orgId)),
		// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types
	] as [any, ...any[]]);

	await db.batch([
		db.delete(schema.session).where(eq(schema.session.userId, userId)),
		db.delete(schema.account).where(eq(schema.account.userId, userId)),
		db.delete(schema.user).where(eq(schema.user.id, userId)),
		// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types
	] as [any, ...any[]]);

	if (env.STORAGE) {
		await deleteR2Prefix(env.STORAGE, `organizations/${orgId}/`);
		await deleteR2Prefix(env.STORAGE, `users/${userId}/`);
	}

	log.info("[OrphanPurge] Purged unclaimed agent kitchen", {
		registrationId: redactId(registration.id),
		orgId: redactId(orgId),
	});
}

/** Cron entry: purge up to `limit` orphan agent kitchens per run. */
export async function purgeOrphanAgentKitchens(
	env: Cloudflare.Env,
	now = new Date(),
	limit = 25,
): Promise<{ purgedCount: number }> {
	const rows = await findOrphanRegistrations(env.DB, now, limit);
	let purgedCount = 0;
	for (const row of rows) {
		if (
			!isOrphanEligible({
				status: row.registration.status,
				preClaim: row.registration.preClaim,
				createdAt: row.registration.createdAt,
				lastUsedAt: row.lastUsedAt,
				now,
			})
		) {
			continue;
		}
		try {
			await purgeOrphanKitchen(env, row.registration);
			purgedCount++;
		} catch (error) {
			log.error("[OrphanPurge] Failed to purge registration", {
				registrationId: redactId(row.registration.id),
				message: error instanceof Error ? error.message : String(error),
			});
		}
	}
	if (purgedCount > 0) {
		log.info("[OrphanPurge] Cron complete", { purgedCount });
	}
	return { purgedCount };
}
