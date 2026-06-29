import { getBillingStatusForUser } from "~/lib/billing.server";
import { getGroupTierLimits } from "~/lib/capacity.server";
import { handleApiError } from "~/lib/error-handler";
import { checkBalance } from "~/lib/ledger.server";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import type { Route } from "./+types/v1.billing.status";

export async function loader({ request, context }: Route.LoaderArgs) {
	try {
		const { userId, organizationId } = await requireMobileActiveGroup(
			context,
			request,
		);
		const env = context.cloudflare.env;

		const [credits, tierInfo] = await Promise.all([
			checkBalance(env, organizationId),
			getGroupTierLimits(env, organizationId),
		]);

		const billing = await getBillingStatusForUser(env, userId, tierInfo.tier);

		return {
			...billing,
			credits,
		};
	} catch (e) {
		return handleApiError(e);
	}
}
