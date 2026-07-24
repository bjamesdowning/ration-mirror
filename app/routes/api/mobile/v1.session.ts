import { getEffectiveTier, getGroupTierLimits } from "~/lib/capacity.server";
import { handleApiError } from "~/lib/error-handler";
import {
	buildFlagContext,
	getClientSafeFlags,
} from "~/lib/feature-flags/flags.server";
import { AI_COSTS, checkBalance } from "~/lib/ledger.server";
import {
	getMobileUser,
	listMobileOrganizations,
	requireMobileActiveGroup,
} from "~/lib/mobile/auth.server";
import { getOrganizationRecord } from "~/lib/mobile/dashboard.server";
import type { TierSlug } from "~/lib/tiers";
import type { Route } from "./+types/v1.session";

export async function loader({ request, context }: Route.LoaderArgs) {
	try {
		const { userId, organizationId } = await requireMobileActiveGroup(
			context,
			request,
		);
		const env = context.cloudflare.env;
		const flagContext = buildFlagContext(request, env, {
			user: { id: userId },
		});

		const [user, organization, credits, tierInfo, organizations, clientFlags] =
			await Promise.all([
				getMobileUser(env, userId),
				getOrganizationRecord(env, organizationId),
				checkBalance(env, organizationId),
				getGroupTierLimits(env, organizationId),
				listMobileOrganizations(env, userId, organizationId),
				getClientSafeFlags(env, flagContext),
			]);

		if (!user) {
			throw new Response(JSON.stringify({ error: "User not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			});
		}

		const rawAccountTier: TierSlug =
			user.tier === "crew_member" ? "crew_member" : "free";
		const { tier: accountTier, isExpired: accountTierExpired } =
			getEffectiveTier(rawAccountTier, user.tierExpiresAt ?? null);

		return {
			user: {
				id: user.id,
				name: user.name,
				email: user.email,
				image: user.image,
				settings: user.settings ?? {},
			},
			organization,
			credits,
			/** Organization effective tier (owner-derived household capacity). */
			tier: tierInfo.tier,
			isTierExpired: tierInfo.isExpired,
			/** Personal subscription tier (purchase / "Your plan"). */
			accountTier,
			accountTierExpired,
			organizations,
			aiCosts: AI_COSTS,
			clientFlags,
		};
	} catch (e) {
		return handleApiError(e);
	}
}
