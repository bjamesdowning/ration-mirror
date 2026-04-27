import { and, eq } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "~/db/schema";
import { getEffectiveTier } from "~/lib/capacity.server";
import type { SignedIntercomAttributes } from "~/lib/intercom.server";
import { toUnixSeconds } from "~/lib/intercom-utils";
import type { TierSlug } from "~/lib/tiers.server";

type SessionUser = {
	id: string;
	name: string;
	email: string;
	createdAt: unknown;
	tier?: string | null;
	tierExpiresAt?: number | null;
	isAdmin?: boolean | null;
	welcomeVoucherRedeemed?: boolean | null;
	tosVersion?: string | null;
};

type Extras = {
	/** UI theme preference ("light" | "dark") — from root loader cookie/session. */
	theme?: string;
	/** Active organization AI credit balance. */
	creditBalance?: number;
};

/**
 * Build the signed attribute set for the Intercom JWT.
 *
 * Fetches the small number of user columns not surfaced in the Better Auth
 * session (`stripeCustomerId`, `subscriptionCancelAtPeriodEnd`, `crewSubscribedAt`)
 * plus the active org member role — all in a single parallel D1 round-trip.
 *
 * Returns a `SignedIntercomAttributes` object ready to pass into `signIntercomJwt`.
 * Keys with null/undefined values are omitted so the JWT stays compact.
 */
export async function buildIntercomAttributes(
	db: DrizzleD1Database<typeof schema>,
	sessionUser: SessionUser,
	activeOrganizationId: string | null,
	extras?: Extras,
): Promise<SignedIntercomAttributes> {
	const rawTier: TierSlug =
		sessionUser.tier === "crew_member" ? "crew_member" : "free";

	const { tier, isExpired } = getEffectiveTier(
		rawTier,
		sessionUser.tierExpiresAt ?? null,
	);

	const [extraUser, memberRow] = await Promise.all([
		db.query.user.findFirst({
			where: eq(schema.user.id, sessionUser.id),
			columns: {
				stripeCustomerId: true,
				subscriptionCancelAtPeriodEnd: true,
				crewSubscribedAt: true,
			},
		}),
		activeOrganizationId
			? db.query.member.findFirst({
					where: and(
						eq(schema.member.organizationId, activeOrganizationId),
						eq(schema.member.userId, sessionUser.id),
					),
					columns: { role: true },
				})
			: Promise.resolve(undefined),
	]);

	const tierExpiresAtSec =
		rawTier === "crew_member" && sessionUser.tierExpiresAt != null
			? (toUnixSeconds(sessionUser.tierExpiresAt) ?? undefined)
			: undefined;

	const crewSubscribedAtSec = extraUser?.crewSubscribedAt
		? (toUnixSeconds(extraUser.crewSubscribedAt) ?? undefined)
		: undefined;

	const attrs: SignedIntercomAttributes = {
		tier,
		tier_expired: isExpired,
		...(tierExpiresAtSec !== undefined
			? { tier_expires_at: tierExpiresAtSec }
			: {}),
		...(extraUser?.stripeCustomerId
			? { stripe_customer_id: extraUser.stripeCustomerId }
			: {}),
		subscription_cancel_at_period_end:
			extraUser?.subscriptionCancelAtPeriodEnd ?? false,
		...(crewSubscribedAtSec !== undefined
			? { crew_subscribed_at: crewSubscribedAtSec }
			: {}),
		welcome_voucher_redeemed: sessionUser.welcomeVoucherRedeemed ?? false,
		is_admin: sessionUser.isAdmin ?? false,
		...(memberRow?.role ? { org_role: memberRow.role } : {}),
		...(extras?.creditBalance !== undefined
			? { credit_balance: extras.creditBalance }
			: {}),
		...(sessionUser.tosVersion ? { tos_version: sessionUser.tosVersion } : {}),
		...(extras?.theme ? { theme: extras.theme } : {}),
	};

	return attrs;
}
