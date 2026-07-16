import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "~/db/schema";
import { purgeCopilotConversationsForOrganization } from "~/lib/copilot/purge.server";
import { retryOnD1Contention } from "~/lib/error-handler";
import { log, redactId } from "~/lib/logging.server";
import {
	isPersonalOrganization,
	PERSONAL_GROUP_DELETE_MESSAGE,
} from "~/lib/personal-group";
import { notifyPurgeFailure } from "~/lib/purge-failure-notify.server";
import {
	clearPurgeJob,
	markPurgeJobFailed,
	putPurgeJob,
} from "~/lib/purge-pending.server";
import { deleteR2Prefix } from "~/lib/r2-cleanup.server";
import { deleteCargoVectors } from "~/lib/vector.server";

const CARGO_VECTOR_DELETE_CHUNK = 500;

export interface DeleteOrganizationOptions {
	skipVectorize?: boolean;
	skipR2?: boolean;
	/** When true, skip access revocation (already done in the fast path). */
	skipAccessRevocation?: boolean;
}

export class PersonalGroupDeleteBlockedError extends Error {
	readonly code = "personal_group" as const;

	constructor(message = PERSONAL_GROUP_DELETE_MESSAGE) {
		super(message);
		this.name = "PersonalGroupDeleteBlockedError";
	}
}

/**
 * Throws if the organization is the owner's personal home group.
 */
export async function assertNotPersonalGroup(
	env: Env,
	organizationId: string,
	ownerUserId?: string,
): Promise<void> {
	const db = drizzle(env.DB, { schema });
	const org = await db.query.organization.findFirst({
		where: eq(schema.organization.id, organizationId),
		columns: { slug: true, metadata: true },
	});
	if (!org) return;
	if (isPersonalOrganization(org, ownerUserId)) {
		throw new PersonalGroupDeleteBlockedError();
	}
}

async function deleteOrganizationCargoVectors(
	env: Env,
	organizationId: string,
): Promise<void> {
	const db = drizzle(env.DB, { schema });
	let offset = 0;

	for (;;) {
		const rows = await db
			.select({ id: schema.cargo.id })
			.from(schema.cargo)
			.where(eq(schema.cargo.organizationId, organizationId))
			.limit(CARGO_VECTOR_DELETE_CHUNK)
			.offset(offset);

		if (rows.length === 0) break;

		await deleteCargoVectors(
			env,
			rows.map((row) => row.id),
		);

		offset += rows.length;
		if (rows.length < CARGO_VECTOR_DELETE_CHUNK) break;
	}
}

/**
 * Immediate lockout: clear active sessions and remove memberships/invitations.
 * Callers should redirect the user away before running the heavy purge.
 */
export async function revokeOrganizationAccess(
	env: Env,
	organizationId: string,
): Promise<void> {
	const db = drizzle(env.DB, { schema });
	await db.batch([
		db
			.update(schema.session)
			.set({ activeOrganizationId: null })
			.where(eq(schema.session.activeOrganizationId, organizationId)),
		db
			.delete(schema.invitation)
			.where(eq(schema.invitation.organizationId, organizationId)),
		db
			.delete(schema.member)
			.where(eq(schema.member.organizationId, organizationId)),
		// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types are complex
	] as [any, ...any[]]);
}

/**
 * Deletes an organization and all org-scoped data (Vectorize, D1, R2 prefix).
 * Shared by web/mobile group delete and account purge flows.
 */
export async function deleteOrganization(
	env: Env,
	organizationId: string,
	options?: DeleteOrganizationOptions,
): Promise<void> {
	const db = drizzle(env.DB, { schema });

	log.info("[DeleteOrganization] Starting org deletion", {
		orgId: redactId(organizationId),
	});

	if (!options?.skipVectorize) {
		await deleteOrganizationCargoVectors(env, organizationId);
	}
	await purgeCopilotConversationsForOrganization(env, organizationId);

	await db
		.delete(schema.queueJob)
		.where(eq(schema.queueJob.organizationId, organizationId));

	const accessStmts = options?.skipAccessRevocation
		? []
		: [
				db
					.update(schema.session)
					.set({ activeOrganizationId: null })
					.where(eq(schema.session.activeOrganizationId, organizationId)),
				db
					.delete(schema.invitation)
					.where(eq(schema.invitation.organizationId, organizationId)),
				db
					.delete(schema.member)
					.where(eq(schema.member.organizationId, organizationId)),
			];

	await db.batch([
		...accessStmts,
		db
			.delete(schema.cargo)
			.where(eq(schema.cargo.organizationId, organizationId)),
		db
			.delete(schema.meal)
			.where(eq(schema.meal.organizationId, organizationId)),
		db
			.delete(schema.activeMealSelection)
			.where(eq(schema.activeMealSelection.organizationId, organizationId)),
		db
			.delete(schema.activeCargoSelection)
			.where(eq(schema.activeCargoSelection.organizationId, organizationId)),
		db
			.delete(schema.supplyList)
			.where(eq(schema.supplyList.organizationId, organizationId)),
		db
			.delete(schema.supplySnooze)
			.where(eq(schema.supplySnooze.organizationId, organizationId)),
		db
			.delete(schema.mealPlan)
			.where(eq(schema.mealPlan.organizationId, organizationId)),
		db
			.delete(schema.manifestSupplyDay)
			.where(eq(schema.manifestSupplyDay.organizationId, organizationId)),
		db.delete(schema.tag).where(eq(schema.tag.organizationId, organizationId)),
		db
			.delete(schema.ledger)
			.where(eq(schema.ledger.organizationId, organizationId)),
		db
			.delete(schema.agentRegistration)
			.where(eq(schema.agentRegistration.organizationId, organizationId)),
		db
			.delete(schema.organization)
			.where(eq(schema.organization.id, organizationId)),
		// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch types are complex
	] as unknown as [any, ...any[]]);

	if (!options?.skipR2 && env.STORAGE) {
		await deleteR2Prefix(env.STORAGE, `organizations/${organizationId}/`);
	}

	log.info("[DeleteOrganization] Completed org deletion", {
		orgId: redactId(organizationId),
	});
}

/**
 * Revoke access immediately, then finish hard purge in the background.
 */
export async function beginOrganizationPurge(
	env: Env,
	ctx: { waitUntil: (promise: Promise<unknown>) => void },
	organizationId: string,
): Promise<{ jobId: string }> {
	const jobId = crypto.randomUUID();
	await putPurgeJob(env.RATION_KV, {
		id: jobId,
		kind: "group",
		organizationId,
	});
	await revokeOrganizationAccess(env, organizationId);

	ctx.waitUntil(
		(async () => {
			try {
				await retryOnD1Contention(() =>
					deleteOrganization(env, organizationId, {
						skipAccessRevocation: true,
					}),
				);
				await clearPurgeJob(env.RATION_KV, jobId);
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : String(error);
				log.error("[DeleteOrganization] Background org purge failed", {
					orgId: redactId(organizationId),
					jobId: redactId(jobId),
					errorMessage,
				});
				await markPurgeJobFailed(env.RATION_KV, jobId, errorMessage);
				await notifyPurgeFailure(env, {
					kind: "group",
					resourceId: `${organizationId}:${jobId}`,
					errorMessage,
				});
			}
		})(),
	);

	return { jobId };
}
