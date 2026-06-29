import { getGroupTierLimits } from "~/lib/capacity.server";
import { handleApiError } from "~/lib/error-handler";
import { AI_COSTS, checkBalance } from "~/lib/ledger.server";
import {
	getMobileUser,
	listMobileOrganizations,
	requireMobileActiveGroup,
} from "~/lib/mobile/auth.server";
import { getOrganizationRecord } from "~/lib/mobile/dashboard.server";
import type { Route } from "./+types/v1.session";

export async function loader({ request, context }: Route.LoaderArgs) {
	try {
		const { userId, organizationId } = await requireMobileActiveGroup(
			context,
			request,
		);
		const env = context.cloudflare.env;

		const [user, organization, credits, tierInfo, organizations] =
			await Promise.all([
				getMobileUser(env, userId),
				getOrganizationRecord(env, organizationId),
				checkBalance(env, organizationId),
				getGroupTierLimits(env, organizationId),
				listMobileOrganizations(env, userId, organizationId),
			]);

		if (!user) {
			throw new Response(JSON.stringify({ error: "User not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			});
		}

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
			tier: tierInfo.tier,
			isTierExpired: tierInfo.isExpired,
			organizations,
			aiCosts: AI_COSTS,
		};
	} catch (e) {
		return handleApiError(e);
	}
}
