import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "~/db/schema";
import { invalidateTierCache } from "~/lib/capacity.server";

export async function resolveBillingOrganizationId(
	env: Env,
	userId: string,
): Promise<string | null> {
	const db = drizzle(env.DB, { schema });
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
