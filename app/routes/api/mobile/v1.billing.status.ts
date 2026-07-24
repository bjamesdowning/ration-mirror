import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "~/db/schema";
import { getBillingStatusForUser } from "~/lib/billing.server";
import { getEffectiveTier, getGroupTierLimits } from "~/lib/capacity.server";
import { handleApiError } from "~/lib/error-handler";
import { checkBalance } from "~/lib/ledger.server";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { MobileBillingStatusSchema } from "~/lib/schemas/mobile/billing";
import type { TierSlug } from "~/lib/tiers";
import type { Route } from "./+types/v1.billing.status";

export async function loader({ request, context }: Route.LoaderArgs) {
	try {
		const { userId, organizationId } = await requireMobileActiveGroup(
			context,
			request,
		);
		const env = context.cloudflare.env;
		const db = drizzle(env.DB, { schema });

		const [credits, tierInfo, userRow] = await Promise.all([
			checkBalance(env, organizationId),
			getGroupTierLimits(env, organizationId),
			db.query.user.findFirst({
				where: eq(schema.user.id, userId),
				columns: {
					tier: true,
					tierExpiresAt: true,
				},
			}),
		]);

		const rawAccountTier: TierSlug =
			userRow?.tier === "crew_member" ? "crew_member" : "free";
		const { tier: accountTier, isExpired: accountTierExpired } =
			getEffectiveTier(rawAccountTier, userRow?.tierExpiresAt ?? null);

		const billing = await getBillingStatusForUser(env, userId, accountTier);

		return MobileBillingStatusSchema.parse({
			...billing,
			accountTier,
			accountTierExpired,
			organizationTier: tierInfo.tier,
			organizationTierExpired: tierInfo.isExpired,
			credits,
		});
	} catch (e) {
		return handleApiError(e);
	}
}
