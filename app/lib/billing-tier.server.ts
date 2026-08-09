import { and, desc, eq, gt, isNotNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "~/db/schema";
import { readLastActiveBillingOrg } from "~/lib/billing-idempotency.server";
import { invalidateTierCache } from "~/lib/capacity.server";
import { hasOrgMembership } from "~/lib/org-membership.server";

export type ResolveBillingOrganizationOptions = {
	/** Preferred org from RevenueCat subscriber attribute `organization_id`. */
	preferredOrganizationId?: string | null;
};

async function membershipOrganizationId(
	env: Env,
	userId: string,
	organizationId: string | null | undefined,
): Promise<string | null> {
	if (!organizationId) return null;
	const ok = await hasOrgMembership(env.DB, userId, organizationId);
	return ok ? organizationId : null;
}

/**
 * Resolve which organization should receive billing fulfillment (credits / crew).
 *
 * Priority (each candidate must be a current membership):
 * 1. RevenueCat subscriber attribute `organization_id`
 * 2. KV last-active org from mobile token issue/refresh
 * 3. Most recent non-expired web session with an active organization
 * 4. First owner membership, else any membership
 */
export async function resolveBillingOrganizationId(
	env: Env,
	userId: string,
	options?: ResolveBillingOrganizationOptions,
): Promise<string | null> {
	const preferred = await membershipOrganizationId(
		env,
		userId,
		options?.preferredOrganizationId,
	);
	if (preferred) return preferred;

	const kvOrg = await membershipOrganizationId(
		env,
		userId,
		await readLastActiveBillingOrg(env.RATION_KV, userId),
	);
	if (kvOrg) return kvOrg;

	const db = drizzle(env.DB, { schema });
	const sessionRow = await db.query.session.findFirst({
		where: and(
			eq(schema.session.userId, userId),
			isNotNull(schema.session.activeOrganizationId),
			gt(schema.session.expiresAt, new Date()),
		),
		orderBy: [desc(schema.session.updatedAt)],
		columns: { activeOrganizationId: true },
	});
	const sessionOrg = await membershipOrganizationId(
		env,
		userId,
		sessionRow?.activeOrganizationId,
	);
	if (sessionOrg) return sessionOrg;

	const ownerMembership = await db.query.member.findFirst({
		where: and(
			eq(schema.member.userId, userId),
			eq(schema.member.role, "owner"),
		),
		columns: { organizationId: true },
	});
	if (ownerMembership) return ownerMembership.organizationId;

	const anyMembership = await db.query.member.findFirst({
		where: eq(schema.member.userId, userId),
		columns: { organizationId: true },
	});
	return anyMembership?.organizationId ?? null;
}

async function invalidateTierCacheForUserOwners(
	env: Env,
	userId: string,
): Promise<void> {
	const db = drizzle(env.DB, { schema });
	const memberships = await db.query.member.findMany({
		where: and(
			eq(schema.member.userId, userId),
			eq(schema.member.role, "owner"),
		),
		columns: { organizationId: true },
	});
	await Promise.all(
		memberships.map((m) => invalidateTierCache(env, m.organizationId)),
	);
}

export async function grantCrewMemberTier(
	env: Env,
	params: {
		userId: string;
		organizationId: string;
		periodEnd: Date;
		stripeCustomerId?: string | null;
	},
): Promise<void> {
	const db = drizzle(env.DB, { schema });
	const updatePayload: Record<string, unknown> = {
		tier: "crew_member",
		tierExpiresAt: params.periodEnd,
		crewSubscribedAt: sql`coalesce(crew_subscribed_at, unixepoch())`,
		subscriptionCancelAtPeriodEnd: false,
	};
	if (params.stripeCustomerId) {
		updatePayload.stripeCustomerId = params.stripeCustomerId;
	}

	await db
		.update(schema.user)
		.set(updatePayload)
		.where(eq(schema.user.id, params.userId));

	await invalidateTierCache(env, params.organizationId);
}

export async function revokeCrewMemberTier(
	env: Env,
	params: {
		userId: string;
		organizationId?: string | null;
	},
): Promise<void> {
	const db = drizzle(env.DB, { schema });
	await db
		.update(schema.user)
		.set({
			tier: "free",
			tierExpiresAt: null,
			crewSubscribedAt: null,
			subscriptionCancelAtPeriodEnd: false,
		})
		.where(eq(schema.user.id, params.userId));

	if (params.organizationId) {
		await invalidateTierCache(env, params.organizationId);
	} else {
		await invalidateTierCacheForUserOwners(env, params.userId);
	}
}
