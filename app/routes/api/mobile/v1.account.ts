import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { data } from "react-router";
import * as schema from "~/db/schema";
import { evaluateAccountDeletionEligibility } from "~/lib/account-deletion-gate";
import { getBillingStatusForUser } from "~/lib/billing.server";
import { handleApiError } from "~/lib/error-handler";
import { requireMobileUserAuth } from "~/lib/mobile/auth.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import { AccountDeletionPreviewSchema } from "~/lib/schemas/account-deletion";
import {
	AccountDeletionBlockedError,
	assertAccountDeletionAllowed,
	beginAccountPurge,
	cancelStripeBeforeAccountPurge,
} from "~/lib/user-purge.server";
import type { Route } from "./+types/v1.account";

/** Groups the user solely owns that will be deleted during account purge. */
async function ownedGroupsWithNoOtherMembers(
	env: Cloudflare.Env,
	userId: string,
): Promise<string[]> {
	const db = drizzle(env.DB, { schema });
	const memberships = await db.query.member.findMany({
		where: eq(schema.member.userId, userId),
		with: {
			organization: {
				columns: { id: true, name: true },
			},
		},
	});

	const owned = memberships.filter((m) => m.role === "owner");
	const soloOwned: string[] = [];

	for (const membership of owned) {
		const orgMembers = await db
			.select({ id: schema.member.id })
			.from(schema.member)
			.where(eq(schema.member.organizationId, membership.organizationId));
		if (orgMembers.length === 1) {
			soloOwned.push(membership.organization.name);
		}
	}

	return soloOwned;
}

export async function loader({ request, context }: Route.LoaderArgs) {
	try {
		const { userId } = await requireMobileUserAuth(context, request);
		const env = context.cloudflare.env;
		const db = drizzle(env.DB, { schema });

		const user = await db.query.user.findFirst({
			where: eq(schema.user.id, userId),
			columns: {
				tier: true,
				tierExpiresAt: true,
				subscriptionCancelAtPeriodEnd: true,
			},
		});

		const eligibility = evaluateAccountDeletionEligibility({
			tier: user?.tier ?? "free",
			tierExpiresAt: user?.tierExpiresAt ?? null,
			subscriptionCancelAtPeriodEnd:
				user?.subscriptionCancelAtPeriodEnd ?? false,
		});

		const billingStatus = await getBillingStatusForUser(
			env,
			userId,
			eligibility.effectiveTier,
		);

		const ownedGroups = await ownedGroupsWithNoOtherMembers(env, userId);

		return AccountDeletionPreviewSchema.parse({
			ownedGroupsWithNoOtherMembers: ownedGroups,
			canDelete: eligibility.canDelete,
			blockReason: eligibility.blockReason,
			cancelAtPeriodEnd: eligibility.cancelAtPeriodEnd,
			tierExpiresAt: eligibility.tierExpiresAt,
			message: eligibility.message,
			managementUrl: billingStatus.management.url,
			billingProvider: billingStatus.management.store,
		});
	} catch (e) {
		return handleApiError(e);
	}
}

export async function action({ request, context }: Route.ActionArgs) {
	if (request.method !== "DELETE") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

	try {
		const { userId } = await requireMobileUserAuth(context, request);
		const env = context.cloudflare.env;

		const rateLimitResult = await checkRateLimit(
			env.RATION_KV,
			"user_purge",
			userId,
		);
		if (!rateLimitResult.allowed) {
			throw rateLimitResponse(
				rateLimitResult,
				"Account deletion is rate limited. Please try again later.",
			);
		}

		const { email, stripeCustomerId } = await assertAccountDeletionAllowed(
			env,
			userId,
		);

		await cancelStripeBeforeAccountPurge(env, stripeCustomerId);

		await beginAccountPurge(env, context.cloudflare.ctx, {
			userId,
			email,
			stripeCustomerId,
		});

		return { success: true, deleted: true };
	} catch (e) {
		if (e instanceof AccountDeletionBlockedError) {
			throw data(
				{
					error: e.message,
					code: e.code,
					eligibility: e.eligibility,
				},
				{ status: 409 },
			);
		}
		return handleApiError(e);
	}
}
